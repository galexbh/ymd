//! DepsManager against a mock GitHub API and a mock nodejs.org (httpmock). No real network,
//! except the `#[ignore]`d smoke tests at the bottom.

use httpmock::prelude::*;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tempfile::TempDir;
use ymd_lib::deps::catalog::{self, ArchiveKind, Checksum, Host, Platform, Source};
use ymd_lib::deps::manager::{DepsManager, ProgressFn};
use ymd_lib::deps::manifest::Manifest;
use ymd_lib::deps::nodejs;
use ymd_lib::model::{DepId, DepPhase, DepProgress, DepState, UpdateChannel};
use ymd_lib::paths::{exe_name, AppPaths};

const CHANNEL: UpdateChannel = UpdateChannel::Stable;
/// Path of the fake nodejs.org `dist/` on the mock server.
const NODE_DIST: &str = "/node/dist";

fn source(id: DepId) -> Option<Source> {
    catalog::spec(id, Platform::current(), catalog::channel_repo(CHANNEL)).source
}

fn sha(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

struct Env {
    server: MockServer,
    _dir: TempDir,
    bin: PathBuf,
    mgr: DepsManager,
}

fn env() -> Env {
    let server = MockServer::start();
    let dir = tempfile::tempdir().unwrap();
    let bin = dir.path().join("bin");
    let paths = AppPaths::new(
        dir.path().join("data"),
        dir.path().join("config"),
        Some(bin.to_str().unwrap()),
    );
    let mgr = DepsManager::with_endpoints(paths, CHANNEL, server.base_url(), server.url(NODE_DIST));
    Env {
        server,
        _dir: dir,
        bin,
        mgr,
    }
}

#[derive(Clone, Default)]
struct Events(Arc<Mutex<Vec<DepProgress>>>);

impl Events {
    fn callback(&self) -> ProgressFn {
        let inner = self.0.clone();
        Arc::new(move |p| inner.lock().unwrap().push(p))
    }
    fn phases(&self) -> Vec<DepPhase> {
        let mut out: Vec<DepPhase> = Vec::new();
        for p in self.0.lock().unwrap().iter() {
            if out.last() != Some(&p.phase) {
                out.push(p.phase);
            }
        }
        out
    }
    fn last(&self) -> DepProgress {
        self.0.lock().unwrap().last().cloned().unwrap()
    }
}

/// Serve one release of `source` at `tag`: the asset plus its checksum file (if any).
/// `checksum_override` replaces the digest written in the checksum file.
/// Returns the mocks so a test can delete them to publish a newer release.
fn publish<'a>(
    server: &'a MockServer,
    source: &Source,
    tag: &str,
    asset_name: &str,
    body: &[u8],
    checksum_override: Option<&str>,
) -> Vec<httpmock::Mock<'a>> {
    let dl = |name: &str| format!("/dl/{tag}/{name}");
    let digest = checksum_override
        .map(str::to_string)
        .unwrap_or_else(|| sha(body));
    let mut assets = vec![serde_json::json!({
        "name": asset_name,
        "browser_download_url": server.url(dl(asset_name)),
        "size": body.len(),
        "updated_at": format!("{tag}T00:00:00Z"),
        "digest": null,
    })];
    let mut mocks = Vec::new();
    let checksum_file = match &source.checksum {
        Checksum::SumsFile { asset } => Some((
            asset.clone(),
            format!(
                "{}  unrelated.bin\n{digest}  {asset_name}\n",
                sha(b"unrelated")
            ),
        )),
        // Some sidecars are PowerShell `Get-FileHash` output; exercise that format.
        Checksum::Sidecar { asset } => Some((
            asset.clone(),
            format!(
                "\r\nAlgorithm : SHA256\r\nHash      : {}\r\nPath      : C:\\x\\{asset_name}\r\n",
                digest.to_uppercase()
            ),
        )),
        Checksum::None => None,
    };
    if let Some((name, text)) = checksum_file {
        assets.push(serde_json::json!({
            "name": name,
            "browser_download_url": server.url(dl(&name)),
            "size": text.len(),
        }));
        let path = dl(&name);
        mocks.push(server.mock(|when, then| {
            when.method(GET).path(path);
            then.status(200).body(text);
        }));
    }
    let api_path = match &source.tag {
        Some(t) => format!("/repos/{}/releases/tags/{t}", source.repo),
        None => format!("/repos/{}/releases/latest", source.repo),
    };
    let release = serde_json::json!({
        "tag_name": source.tag.clone().unwrap_or_else(|| tag.to_string()),
        "published_at": format!("{tag}T00:00:00Z"),
        "assets": assets,
    });
    mocks.push(server.mock(|when, then| {
        when.method(GET).path(api_path).header_exists("user-agent");
        then.status(200)
            .header("content-type", "application/json")
            .json_body(release);
    }));
    let path = dl(asset_name);
    let body = body.to_vec();
    mocks.push(server.mock(|when, then| {
        when.method(GET).path(path);
        then.status(200).body(body);
    }));
    mocks
}

fn zip_bytes(files: &[(String, Vec<u8>)]) -> Vec<u8> {
    let mut z = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    for (name, data) in files {
        z.start_file(name.as_str(), zip::write::SimpleFileOptions::default())
            .unwrap();
        z.write_all(data).unwrap();
    }
    z.finish().unwrap().into_inner()
}

fn tar_xz_bytes(files: &[(String, Vec<u8>)]) -> Vec<u8> {
    let enc = xz2::write::XzEncoder::new(Vec::new(), 6);
    let mut b = tar::Builder::new(enc);
    for (name, data) in files {
        let mut h = tar::Header::new_gnu();
        h.set_size(data.len() as u64);
        h.set_mode(0o755);
        h.set_cksum();
        b.append_data(&mut h, name, data.as_slice()).unwrap();
    }
    b.into_inner().unwrap().finish().unwrap()
}

fn tar_gz_bytes(files: &[(String, Vec<u8>)]) -> Vec<u8> {
    let enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    let mut b = tar::Builder::new(enc);
    for (name, data) in files {
        let mut h = tar::Header::new_gnu();
        h.set_size(data.len() as u64);
        h.set_mode(0o755);
        h.set_cksum();
        b.append_data(&mut h, name, data.as_slice()).unwrap();
    }
    b.into_inner().unwrap().finish().unwrap()
}

fn archive_bytes(kind: &ArchiveKind, files: &[(String, Vec<u8>)]) -> Vec<u8> {
    match kind {
        ArchiveKind::Zip => zip_bytes(files),
        ArchiveKind::TarXz => tar_xz_bytes(files),
        ArchiveKind::TarGz => tar_gz_bytes(files),
        other => panic!("no test builder for {other:?}"),
    }
}

fn assert_executable(path: &Path) {
    assert!(path.is_file(), "{} missing", path.display());
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o755, "{}", path.display());
    }
}

fn no_leftovers(bin: &Path) {
    for e in std::fs::read_dir(bin).unwrap().flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        assert!(
            !name.ends_with(".part") && !name.ends_with(".old") && !name.starts_with(".ymd-work"),
            "leftover {name}"
        );
    }
}

#[tokio::test]
async fn installs_raw_ytdlp_with_sums_file() {
    let e = env();
    let src = source(DepId::Ytdlp).unwrap();
    assert_eq!(src.archive, ArchiveKind::Raw);
    publish(&e.server, &src, "2026.01.01", &src.asset, b"ytdlp-v1", None);

    let events = Events::default();
    e.mgr
        .install(DepId::Ytdlp, events.callback())
        .await
        .unwrap();

    let installed = e.bin.join(exe_name("yt-dlp"));
    assert_eq!(std::fs::read(&installed).unwrap(), b"ytdlp-v1");
    assert_executable(&installed);
    no_leftovers(&e.bin);
    assert_eq!(
        events.phases(),
        vec![
            DepPhase::Resolving,
            DepPhase::Downloading,
            DepPhase::Verifying,
            DepPhase::Done
        ]
    );
    let m = Manifest::load(&e.bin);
    let entry = m.get(DepId::Ytdlp).unwrap();
    assert_eq!(entry.tag, "2026.01.01");
    assert!(entry.verified);
    assert_eq!(entry.asset, src.asset);

    let report = e.mgr.report(false).await.unwrap();
    let st = report.deps.iter().find(|d| d.id == DepId::Ytdlp).unwrap();
    assert_eq!(st.state, DepState::Installed);
    assert!(st.verified);
    assert_eq!(st.path.as_deref(), Some(installed.to_str().unwrap()));
    assert_eq!(st.latest, None, "no network without check_latest");
    assert_eq!(report.bin_dir, e.bin.to_string_lossy());
    assert_eq!(report.deps.len(), DepId::ALL.len());
}

/// Real-looking Node archive for `version` (`v24.21.0`): `node.exe` at the root on Windows,
/// `bin/node` on Unix, plus files that must not be extracted.
fn node_archive(src: &Source, version: &str, body: &[u8]) -> Vec<u8> {
    let name = nodejs::asset_name(src, version);
    let root = name
        .trim_end_matches(".zip")
        .trim_end_matches(".tar.gz")
        .trim_end_matches(".tar.xz")
        .to_string();
    let exe = if cfg!(windows) {
        format!("{root}/node.exe")
    } else {
        format!("{root}/bin/node")
    };
    archive_bytes(
        &src.archive,
        &[
            (format!("{root}/README.md"), b"readme".to_vec()),
            (exe, body.to_vec()),
            (format!("{root}/{}", exe_name("npm")), b"npm".to_vec()),
        ],
    )
}

/// Serve a fake nodejs.org: `index.json` listing `index` (version, lts) newest first, and for
/// `version` the archive + `SHASUMS256.txt`. Returns the mocks so a test can replace them.
fn publish_node<'a>(
    server: &'a MockServer,
    src: &Source,
    index: &[(&str, bool)],
    version: &str,
    archive: &[u8],
    checksum_override: Option<&str>,
) -> Vec<httpmock::Mock<'a>> {
    let key = nodejs::files_key(&src.asset).unwrap();
    let entries: Vec<serde_json::Value> = index
        .iter()
        .map(|(v, lts)| {
            let lts = if *lts {
                serde_json::json!("Krypton")
            } else {
                serde_json::json!(false)
            };
            serde_json::json!({
                "version": v,
                "date": "2026-10-01",
                "files": [key, "src", "headers"],
                "lts": lts,
            })
        })
        .collect();
    let name = nodejs::asset_name(src, version);
    let digest = checksum_override
        .map(str::to_string)
        .unwrap_or_else(|| sha(archive));
    let sums = format!(
        "{}  node-{version}.tar.gz\n{digest}  {name}\n{}  win-x64/node.exe\n",
        sha(b"other"),
        sha(b"exe")
    );
    let dir = format!("{NODE_DIST}/{version}");
    let body = archive.to_vec();
    vec![
        server.mock(|when, then| {
            when.method(GET)
                .path(format!("{NODE_DIST}/index.json"))
                .header_exists("user-agent");
            then.status(200)
                .header("content-type", "application/json")
                .json_body(serde_json::Value::Array(entries));
        }),
        server.mock(|when, then| {
            when.method(GET)
                .path(format!("{dir}/{}", nodejs::SUMS_FILE));
            then.status(200).body(sums);
        }),
        server.mock(|when, then| {
            when.method(GET).path(format!("{dir}/{name}"));
            then.status(200).body(body);
        }),
    ]
}

fn node_status(r: &ymd_lib::model::DepsReport) -> ymd_lib::model::DepStatus {
    r.deps
        .iter()
        .find(|d| d.id == DepId::Node)
        .cloned()
        .unwrap()
}

#[tokio::test]
async fn installs_node_lts_from_nodejs_org() {
    let e = env();
    let src = source(DepId::Node).unwrap();
    assert_eq!(src.host, Host::NodeJs);
    let index = [
        ("v26.11.1", false),
        ("v24.21.0", true),
        ("v22.30.0", true),
        ("v20.19.9", true),
    ];
    let v1 = publish_node(
        &e.server,
        &src,
        &index,
        "v24.21.0",
        &node_archive(&src, "v24.21.0", b"node-24"),
        None,
    );

    let events = Events::default();
    e.mgr.install(DepId::Node, events.callback()).await.unwrap();

    let node = e.bin.join(exe_name("node"));
    assert_eq!(std::fs::read(&node).unwrap(), b"node-24");
    assert_executable(&node);
    assert!(!e.bin.join("README.md").exists());
    assert!(!e.bin.join(exe_name("npm")).exists());
    no_leftovers(&e.bin);
    assert_eq!(
        events.phases(),
        vec![
            DepPhase::Resolving,
            DepPhase::Downloading,
            DepPhase::Verifying,
            DepPhase::Extracting,
            DepPhase::Done
        ]
    );
    let entry = Manifest::load(&e.bin).get(DepId::Node).cloned().unwrap();
    assert_eq!(entry.tag, "v24.21.0");
    assert_eq!(entry.asset, nodejs::asset_name(&src, "v24.21.0"));
    assert_eq!(entry.files, vec![exe_name("node")]);
    assert!(entry.verified);

    let st = node_status(&e.mgr.report(true).await.unwrap());
    assert_eq!(st.state, DepState::Installed);
    assert_eq!(st.latest.as_deref(), Some("v24.21.0"));
    assert!(!st.update_available);
    assert!(st.verified && st.can_install);

    // A newer LTS shows up as an update; a newer non-LTS line never does.
    for mut m in v1 {
        m.delete();
    }
    publish_node(
        &e.server,
        &src,
        &[("v26.12.0", false), ("v24.22.0", true), ("v24.21.0", true)],
        "v24.22.0",
        &node_archive(&src, "v24.22.0", b"node-24.22"),
        None,
    );
    let st = node_status(&e.mgr.report(true).await.unwrap());
    assert_eq!(st.latest.as_deref(), Some("v24.22.0"));
    assert!(st.update_available);
    e.mgr
        .install(DepId::Node, Events::default().callback())
        .await
        .unwrap();
    assert_eq!(std::fs::read(&node).unwrap(), b"node-24.22");
    assert!(!node_status(&e.mgr.report(true).await.unwrap()).update_available);
}

#[tokio::test]
async fn node_checksum_mismatch_or_no_lts_installs_nothing() {
    let e = env();
    let src = source(DepId::Node).unwrap();
    let mocks = publish_node(
        &e.server,
        &src,
        &[("v24.21.0", true)],
        "v24.21.0",
        &node_archive(&src, "v24.21.0", b"tampered"),
        Some(&sha(b"what-was-published")),
    );
    let err = e
        .mgr
        .install(DepId::Node, Events::default().callback())
        .await
        .unwrap_err();
    assert!(format!("{err:#}").contains("checksum mismatch"), "{err:#}");
    assert!(!e.bin.join(exe_name("node")).exists());
    no_leftovers(&e.bin);

    // Only Node < 22 or non-LTS lines: nothing yt-dlp accepts.
    for mut m in mocks {
        m.delete();
    }
    publish_node(
        &e.server,
        &src,
        &[("v26.0.0", false), ("v20.19.9", true)],
        "v20.19.9",
        b"x",
        None,
    );
    let err = e
        .mgr
        .install(DepId::Node, Events::default().callback())
        .await
        .unwrap_err();
    assert!(err.to_string().contains("no Node.js LTS"), "{err:#}");
}

#[tokio::test]
async fn installs_ffmpeg_and_ffprobe_from_archive() {
    let e = env();
    let Some(src) = source(DepId::Ffmpeg) else {
        // macOS: no download source; installing explains how to get it instead.
        let err = e
            .mgr
            .install(DepId::Ffmpeg, Events::default().callback())
            .await
            .unwrap_err()
            .to_string();
        assert!(err.contains("brew install ffmpeg"), "{err}");
        return;
    };
    let root = "ffmpeg-master-latest-x-gpl";
    let archive = archive_bytes(
        &src.archive,
        &[
            (
                format!("{root}/bin/{}", exe_name("ffmpeg")),
                b"FFMPEG".to_vec(),
            ),
            (
                format!("{root}/bin/{}", exe_name("ffprobe")),
                b"FFPROBE".to_vec(),
            ),
            (format!("{root}/bin/{}", exe_name("ffplay")), b"no".to_vec()),
            (format!("{root}/doc/ffmpeg.html"), b"doc".to_vec()),
        ],
    );
    publish(&e.server, &src, "2026-10-08", &src.asset, &archive, None);

    e.mgr
        .install(DepId::Ffmpeg, Events::default().callback())
        .await
        .unwrap();

    assert_eq!(
        std::fs::read(e.bin.join(exe_name("ffmpeg"))).unwrap(),
        b"FFMPEG"
    );
    assert_eq!(
        std::fs::read(e.bin.join(exe_name("ffprobe"))).unwrap(),
        b"FFPROBE"
    );
    assert_executable(&e.bin.join(exe_name("ffprobe")));
    assert!(!e.bin.join(exe_name("ffplay")).exists());
    no_leftovers(&e.bin);
    let entry = Manifest::load(&e.bin).get(DepId::Ffmpeg).cloned().unwrap();
    assert_eq!(entry.tag, "latest");
    assert_eq!(entry.revision, "latest@2026-10-08T00:00:00Z");
    assert_eq!(entry.files.len(), 2);

    let tools = e.mgr.tools().await;
    assert_eq!(tools.ffmpeg_dir.as_deref(), Some(e.bin.as_path()));
}

#[tokio::test]
async fn checksum_mismatch_keeps_installed_binary() {
    let e = env();
    let src = source(DepId::Ytdlp).unwrap();
    let v1 = publish(&e.server, &src, "2026.01.01", &src.asset, b"ytdlp-v1", None);
    e.mgr
        .install(DepId::Ytdlp, Events::default().callback())
        .await
        .unwrap();
    for mut m in v1 {
        m.delete();
    }

    publish(
        &e.server,
        &src,
        "2026.02.02",
        &src.asset,
        b"tampered",
        Some(&sha(b"what-was-published")),
    );
    let events = Events::default();
    let err = e
        .mgr
        .install(DepId::Ytdlp, events.callback())
        .await
        .unwrap_err();
    assert!(format!("{err:#}").contains("checksum mismatch"), "{err:#}");

    let installed = e.bin.join(exe_name("yt-dlp"));
    assert_eq!(std::fs::read(&installed).unwrap(), b"ytdlp-v1");
    assert_eq!(
        Manifest::load(&e.bin).get(DepId::Ytdlp).unwrap().tag,
        "2026.01.01"
    );
    no_leftovers(&e.bin);
    let last = events.last();
    assert_eq!(last.phase, DepPhase::Error);
    assert!(last.message.unwrap().contains("checksum mismatch"));
}

#[tokio::test]
async fn update_replaces_previous_version() {
    let e = env();
    let src = source(DepId::Ytdlp).unwrap();
    let v1 = publish(&e.server, &src, "2026.01.01", &src.asset, b"ytdlp-v1", None);
    e.mgr
        .install(DepId::Ytdlp, Events::default().callback())
        .await
        .unwrap();

    let st = |r: &ymd_lib::model::DepsReport| {
        r.deps
            .iter()
            .find(|d| d.id == DepId::Ytdlp)
            .cloned()
            .unwrap()
    };
    let before = st(&e.mgr.report(true).await.unwrap());
    assert_eq!(before.latest.as_deref(), Some("2026.01.01"));
    assert!(!before.update_available);

    for mut m in v1 {
        m.delete();
    }
    publish(&e.server, &src, "2026.02.02", &src.asset, b"ytdlp-v2", None);
    let outdated = st(&e.mgr.report(true).await.unwrap());
    assert_eq!(outdated.latest.as_deref(), Some("2026.02.02"));
    assert!(outdated.update_available);

    e.mgr
        .install(DepId::Ytdlp, Events::default().callback())
        .await
        .unwrap();
    assert_eq!(
        std::fs::read(e.bin.join(exe_name("yt-dlp"))).unwrap(),
        b"ytdlp-v2"
    );
    no_leftovers(&e.bin);
    let after = st(&e.mgr.report(true).await.unwrap());
    assert!(!after.update_available);
    assert_eq!(
        Manifest::load(&e.bin).get(DepId::Ytdlp).unwrap().tag,
        "2026.02.02"
    );
}

#[tokio::test]
async fn remove_deletes_only_managed_files() {
    let e = env();
    let src = source(DepId::Node).unwrap();
    let archive = node_archive(&src, "v24.21.0", b"node-bin");
    publish_node(
        &e.server,
        &src,
        &[("v24.21.0", true)],
        "v24.21.0",
        &archive,
        None,
    );
    e.mgr
        .install(DepId::Node, Events::default().callback())
        .await
        .unwrap();
    std::fs::write(e.bin.join("unrelated.txt"), b"keep").unwrap();

    e.mgr.remove(DepId::Node).await.unwrap();
    assert!(!e.bin.join(exe_name("node")).exists());
    assert!(e.bin.join("unrelated.txt").exists());
    assert!(Manifest::load(&e.bin).get(DepId::Node).is_none());
    let report = e.mgr.report(false).await.unwrap();
    assert_ne!(node_status(&report).state, DepState::Installed);
    assert!(report.js_runtimes_found.iter().all(|r| !r.managed));

    // Removing something that is not installed is a no-op.
    e.mgr.remove(DepId::Atomicparsley).await.unwrap();
}

#[tokio::test]
async fn unverified_source_installs_but_reports_unverified() {
    let e = env();
    let Some((id, src)) = [DepId::Atomicparsley, DepId::Aria2c]
        .into_iter()
        .find_map(|id| source(id).map(|s| (id, s)))
    else {
        return; // nothing downloadable without checksum on this platform (Linux arm64)
    };
    assert_eq!(src.checksum, Checksum::None);
    let asset_name = if src.asset_is_prefix {
        "aria2-1.37.0-win-64bit-build1.zip".to_string()
    } else {
        src.asset.clone()
    };
    let bin_name = exe_name(&src.binaries[0]);
    let zip = zip_bytes(&[(format!("pkg/{bin_name}"), b"tool".to_vec())]);
    publish(&e.server, &src, "20240608", &asset_name, &zip, None);

    let events = Events::default();
    e.mgr.install(id, events.callback()).await.unwrap();
    assert!(!events.phases().contains(&DepPhase::Verifying));
    assert_eq!(std::fs::read(e.bin.join(&bin_name)).unwrap(), b"tool");
    let report = e.mgr.report(false).await.unwrap();
    let st = report.deps.iter().find(|d| d.id == id).unwrap();
    assert_eq!(st.state, DepState::Installed);
    assert!(!st.verified);
    assert!(st.can_install);
}

#[tokio::test]
async fn api_failures_surface_as_errors() {
    let e = env();
    let src = source(DepId::Ytdlp).unwrap();
    e.server.mock(|when, then| {
        when.method(GET)
            .path(format!("/repos/{}/releases/latest", src.repo));
        then.status(403).header("x-ratelimit-remaining", "0");
    });
    let events = Events::default();
    let err = e
        .mgr
        .install(DepId::Ytdlp, events.callback())
        .await
        .unwrap_err();
    assert!(err.to_string().contains("rate limit"), "{err:#}");
    assert_eq!(events.last().phase, DepPhase::Error);
    assert!(!e.bin.join(exe_name("yt-dlp")).exists());

    // The report still renders; the failure lands in `error`.
    let report = e.mgr.report(true).await.unwrap();
    let st = report.deps.iter().find(|d| d.id == DepId::Ytdlp).unwrap();
    assert!(st.latest.is_none());
    if st.state == DepState::Missing {
        assert!(st
            .error
            .as_deref()
            .unwrap()
            .contains("could not check for updates"));
    }
}

#[tokio::test]
async fn missing_asset_in_release_is_an_error() {
    let e = env();
    let src = source(DepId::Ytdlp).unwrap();
    publish(&e.server, &src, "2026.01.01", "yt-dlp_x86.exe", b"x", None);
    let err = e
        .mgr
        .install(DepId::Ytdlp, Events::default().callback())
        .await
        .unwrap_err();
    assert!(err.to_string().contains("no asset"), "{err:#}");
}

/// Real network: installs every dep that has a source on this platform into a temp dir.
/// `cargo test --features test-support --test deps_manager -- --ignored --nocapture`
#[tokio::test]
#[ignore = "downloads ~300 MB from GitHub"]
async fn real_network_smoke() {
    let dir = tempfile::tempdir().unwrap();
    let keep = std::env::var_os("YMD_SMOKE_DIR").map(PathBuf::from);
    let bin = keep.unwrap_or_else(|| dir.path().join("bin"));
    let paths = AppPaths::new(
        dir.path().join("data"),
        dir.path().join("config"),
        Some(bin.to_str().unwrap()),
    );
    let mgr = DepsManager::new(paths, UpdateChannel::Stable);
    for id in DepId::ALL {
        if source(id).is_none() {
            println!("{id:?}: no source on this platform");
            continue;
        }
        let started = std::time::Instant::now();
        mgr.install(id, Events::default().callback())
            .await
            .unwrap_or_else(|e| panic!("{id:?}: {e:#}"));
        println!("{id:?}: installed in {:.1?}", started.elapsed());
    }
    let report = mgr.report(true).await.unwrap();
    for d in &report.deps {
        println!(
            "{:?}: state={:?} version={:?} latest={:?} update={} verified={} path={:?} error={:?}",
            d.id, d.state, d.version, d.latest, d.update_available, d.verified, d.path, d.error
        );
    }
    println!("js_runtime={:?}", report.js_runtime);
    println!("js_runtimes_found={:?}", report.js_runtimes_found);
    for id in DepId::ALL {
        if source(id).is_some() {
            let d = report.deps.iter().find(|d| d.id == id).unwrap();
            assert_eq!(d.state, DepState::Installed);
            assert!(d.version.is_some(), "{d:?}");
            assert_eq!(
                d.verified,
                source(id).unwrap().checksum != Checksum::None,
                "{d:?}"
            );
            assert!(!d.update_available, "{d:?}");
        }
    }
}

/// Real network: resolves the current Node.js LTS on nodejs.org, downloads it, checks
/// `SHASUMS256.txt`, extracts `node` and runs it. Set `YMD_SMOKE_DIR` to keep the bin dir.
/// `cargo test --features test-support --test deps_manager real_node_smoke -- --ignored --nocapture`
#[tokio::test]
#[ignore = "downloads ~30 MB from nodejs.org"]
async fn real_node_smoke() {
    let dir = tempfile::tempdir().unwrap();
    let keep = std::env::var_os("YMD_SMOKE_DIR").map(PathBuf::from);
    let bin = keep.unwrap_or_else(|| dir.path().join("bin"));
    let paths = AppPaths::new(
        dir.path().join("data"),
        dir.path().join("config"),
        Some(bin.to_str().unwrap()),
    );
    let mgr = DepsManager::new(paths, UpdateChannel::Stable);
    let started = std::time::Instant::now();
    mgr.install(DepId::Node, Events::default().callback())
        .await
        .unwrap_or_else(|e| panic!("node: {e:#}"));
    println!("node: installed in {:.1?}", started.elapsed());
    let entry = Manifest::load(&bin).get(DepId::Node).cloned().unwrap();
    println!("manifest: {entry:?}");
    assert!(entry.verified);
    let st = node_status(&mgr.report(true).await.unwrap());
    println!("status: {st:?}");
    assert_eq!(st.state, DepState::Installed);
    let major = st
        .version
        .as_deref()
        .and_then(|v| v.split('.').next())
        .and_then(|m| m.parse::<u64>().ok())
        .unwrap();
    assert!(major >= nodejs::MIN_MAJOR, "{st:?}");
    assert_eq!(
        st.latest.as_deref().map(|l| l.trim_start_matches('v')),
        st.version.as_deref()
    );
    assert!(!st.update_available, "{st:?}");
    let rt = mgr.tools().await.js_runtime.unwrap();
    println!("js_runtime={rt:?}");
    assert!(rt.managed);
}
