//! Pulling named executables out of downloaded archives. Blocking; call from
//! `spawn_blocking`. Only the wanted executables are written, always as
//! `<dest>/<file name>`, so archive paths can never escape `dest`. Owner: A.

use super::catalog::ArchiveKind;
use anyhow::{bail, Context};
use std::collections::HashMap;
use std::fs::File;
use std::io::{self, BufReader, Read};
use std::path::{Path, PathBuf};

/// Last path component of an archive entry name (handles `/` and `\`).
fn file_name(entry: &str) -> &str {
    entry.rsplit(['/', '\\']).next().unwrap_or(entry)
}

fn in_bin_dir(entry: &str) -> bool {
    let mut parts = entry.rsplit(['/', '\\']);
    parts.next();
    parts.next() == Some("bin")
}

/// Tracks which wanted file each entry satisfies; an entry inside a `bin/` directory wins
/// over one found elsewhere (FFmpeg-Builds keep executables in `*/bin/`).
struct Picker<'a> {
    wanted: &'a [String],
    dest: &'a Path,
    taken: HashMap<String, bool>,
}

impl<'a> Picker<'a> {
    fn new(wanted: &'a [String], dest: &'a Path) -> Self {
        Self {
            wanted,
            dest,
            taken: HashMap::new(),
        }
    }

    /// File name to write this entry to, if it should be taken.
    fn want(&self, entry: &str) -> Option<String> {
        let name = file_name(entry);
        if !self.wanted.iter().any(|w| w == name) {
            return None;
        }
        match self.taken.get(name) {
            Some(true) => None,
            Some(false) if !in_bin_dir(entry) => None,
            _ => Some(name.to_string()),
        }
    }

    fn write(&mut self, entry: &str, name: String, reader: &mut dyn Read) -> io::Result<()> {
        let out = self.dest.join(&name);
        let mut f = File::create(&out)?;
        io::copy(reader, &mut f)?;
        f.sync_all()?;
        self.taken.insert(name, in_bin_dir(entry));
        Ok(())
    }

    fn finish(self) -> anyhow::Result<Vec<PathBuf>> {
        let mut out = Vec::new();
        for w in self.wanted {
            if !self.taken.contains_key(w) {
                bail!("archive does not contain {w}");
            }
            out.push(self.dest.join(w));
        }
        Ok(out)
    }
}

/// Extract the files named in `wanted` (exact file names, e.g. `ffmpeg.exe`) from `archive`
/// into `dest`. Returns their paths in `wanted` order.
pub fn extract(
    archive: &Path,
    kind: &ArchiveKind,
    wanted: &[String],
    dest: &Path,
) -> anyhow::Result<Vec<PathBuf>> {
    std::fs::create_dir_all(dest)?;
    let mut picker = Picker::new(wanted, dest);
    let open = || -> anyhow::Result<BufReader<File>> {
        Ok(BufReader::new(
            File::open(archive).with_context(|| format!("open {}", archive.display()))?,
        ))
    };
    match kind {
        ArchiveKind::Raw => bail!("raw assets are not archives"),
        ArchiveKind::Zip => {
            let mut zip = zip::ZipArchive::new(open()?).context("not a valid zip archive")?;
            for i in 0..zip.len() {
                let mut entry = zip.by_index(i)?;
                if !entry.is_file() {
                    continue;
                }
                let entry_name = entry.name()?.to_string();
                if let Some(name) = picker.want(&entry_name) {
                    picker.write(&entry_name, name, &mut entry)?;
                }
            }
        }
        ArchiveKind::TarXz => {
            let mut tar = tar::Archive::new(xz2::read::XzDecoder::new(open()?));
            extract_tar(&mut tar, &mut picker)?;
        }
        ArchiveKind::TarGz => {
            let mut tar = tar::Archive::new(flate2::read::GzDecoder::new(open()?));
            extract_tar(&mut tar, &mut picker)?;
        }
    }
    picker.finish()
}

fn extract_tar<R: Read>(tar: &mut tar::Archive<R>, picker: &mut Picker) -> anyhow::Result<()> {
    for entry in tar.entries().context("not a valid tar archive")? {
        let mut entry = entry?;
        if !entry.header().entry_type().is_file() {
            continue;
        }
        let entry_name = entry.path()?.to_string_lossy().into_owned();
        if let Some(name) = picker.want(&entry_name) {
            picker.write(&entry_name, name, &mut entry)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn wanted(names: &[&str]) -> Vec<String> {
        names.iter().map(|s| s.to_string()).collect()
    }

    fn make_zip(path: &Path, files: &[(&str, &[u8])]) {
        let mut z = zip::ZipWriter::new(File::create(path).unwrap());
        let opts = zip::write::SimpleFileOptions::default();
        for (name, data) in files {
            z.start_file(*name, opts).unwrap();
            z.write_all(data).unwrap();
        }
        z.finish().unwrap();
    }

    fn make_tar<W: Write>(w: W, files: &[(&str, &[u8])]) -> W {
        let mut b = tar::Builder::new(w);
        for (name, data) in files {
            let mut h = tar::Header::new_gnu();
            h.set_size(data.len() as u64);
            h.set_mode(0o755);
            h.set_cksum();
            b.append_data(&mut h, name, *data).unwrap();
        }
        b.into_inner().unwrap()
    }

    #[test]
    fn zip_picks_bin_entries() {
        let dir = tempfile::tempdir().unwrap();
        let zip = dir.path().join("a.zip");
        make_zip(
            &zip,
            &[
                ("pkg/doc/ffmpeg", b"doc"),
                ("pkg/bin/ffmpeg", b"FF"),
                ("pkg/bin/ffprobe", b"FP"),
                ("pkg/bin/ffplay", b"no"),
            ],
        );
        let out = dir.path().join("out");
        let got = extract(
            &zip,
            &ArchiveKind::Zip,
            &wanted(&["ffmpeg", "ffprobe"]),
            &out,
        )
        .unwrap();
        assert_eq!(std::fs::read(&got[0]).unwrap(), b"FF");
        assert_eq!(std::fs::read(&got[1]).unwrap(), b"FP");
        assert!(!out.join("ffplay").exists());
    }

    #[test]
    fn tar_xz_and_gz() {
        let dir = tempfile::tempdir().unwrap();
        let files: &[(&str, &[u8])] = &[("x/bin/tool", b"T1"), ("x/README", b"r")];

        let xz = dir.path().join("a.tar.xz");
        let enc = make_tar(
            xz2::write::XzEncoder::new(File::create(&xz).unwrap(), 6),
            files,
        );
        enc.finish().unwrap();
        let got = extract(
            &xz,
            &ArchiveKind::TarXz,
            &wanted(&["tool"]),
            &dir.path().join("o1"),
        )
        .unwrap();
        assert_eq!(std::fs::read(&got[0]).unwrap(), b"T1");

        let gz = dir.path().join("a.tar.gz");
        let enc = make_tar(
            flate2::write::GzEncoder::new(File::create(&gz).unwrap(), Default::default()),
            files,
        );
        enc.finish().unwrap();
        let got = extract(
            &gz,
            &ArchiveKind::TarGz,
            &wanted(&["tool"]),
            &dir.path().join("o2"),
        )
        .unwrap();
        assert_eq!(std::fs::read(&got[0]).unwrap(), b"T1");
    }

    #[test]
    fn missing_binary_is_an_error() {
        let dir = tempfile::tempdir().unwrap();
        let zip = dir.path().join("a.zip");
        make_zip(&zip, &[("deno", b"d")]);
        let err = extract(
            &zip,
            &ArchiveKind::Zip,
            &wanted(&["nope"]),
            &dir.path().join("o"),
        )
        .unwrap_err()
        .to_string();
        assert!(err.contains("nope"), "{err}");
        let not_zip = dir.path().join("b.zip");
        std::fs::write(&not_zip, b"garbage").unwrap();
        assert!(extract(
            &not_zip,
            &ArchiveKind::Zip,
            &wanted(&["x"]),
            &dir.path().join("o")
        )
        .is_err());
    }

    #[test]
    fn traversal_names_stay_in_dest() {
        let dir = tempfile::tempdir().unwrap();
        let zip = dir.path().join("a.zip");
        make_zip(&zip, &[("../../evil/tool", b"E")]);
        let out = dir.path().join("out");
        let got = extract(&zip, &ArchiveKind::Zip, &wanted(&["tool"]), &out).unwrap();
        assert_eq!(got[0], out.join("tool"));
    }
}
