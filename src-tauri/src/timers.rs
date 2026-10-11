//! Periodic background work that follows the wall clock.
//!
//! ymd can sit in the tray for days while the computer sleeps. `tokio::time::sleep(24h)` counts
//! only the time the process was awake, so a daily task could slip by days. Instead each task
//! wakes up every `tick`, compares `SystemTime::now()` with its last run and runs once at least
//! `period` of real time has passed (the same idea as the queue schedule in `jobs`).

use std::future::Future;
use std::time::{Duration, SystemTime};

/// How often a daily task checks the clock.
pub const DAILY_TICK: Duration = Duration::from_secs(30 * 60);
pub const DAY: Duration = Duration::from_secs(24 * 60 * 60);
/// Clean-up of temporary files (job dirs, cookie copies): every 30 minutes of real time.
pub const SWEEP_PERIOD: Duration = Duration::from_secs(30 * 60);
pub const SWEEP_TICK: Duration = Duration::from_secs(5 * 60);

/// Pure: whether a task last run at `last` (`None` = never) is due at `now`. A clock that went
/// backwards (the user changed it) counts as due, so the task never waits for the old time.
pub fn due(last: Option<SystemTime>, now: SystemTime, period: Duration) -> bool {
    match last {
        None => true,
        Some(last) => !matches!(now.duration_since(last), Ok(gone) if gone < period),
    }
}

/// Runs `job` every `period` of wall-clock time, checking every `tick`. With `run_now` the
/// first run happens right away; otherwise one `period` after now.
pub fn spawn_periodic<F, Fut>(period: Duration, tick: Duration, run_now: bool, mut job: F)
where
    F: FnMut() -> Fut + Send + 'static,
    Fut: Future<Output = ()> + Send + 'static,
{
    tauri::async_runtime::spawn(async move {
        let mut last = (!run_now).then(SystemTime::now);
        loop {
            let now = SystemTime::now();
            if due(last, now, period) {
                last = Some(now);
                job().await;
            }
            tokio::time::sleep(tick.min(period)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn due_after_a_full_period_of_real_time() {
        let t0 = SystemTime::UNIX_EPOCH + Duration::from_secs(1_800_000_000);
        assert!(due(None, t0, DAY), "never ran");
        assert!(!due(Some(t0), t0, DAY));
        assert!(!due(Some(t0), t0 + DAY - Duration::from_secs(1), DAY));
        assert!(due(Some(t0), t0 + DAY, DAY));
        // Asleep for three days: one run when it wakes up (the caller then records it).
        assert!(due(Some(t0), t0 + DAY * 3, DAY));
        assert!(!due(Some(t0 + DAY * 3), t0 + DAY * 3 + DAILY_TICK, DAY));
        // The clock was set back: run rather than wait for the old date.
        assert!(due(Some(t0), t0 - Duration::from_secs(3600), DAY));
    }

    #[tokio::test]
    async fn periodic_task_runs_now_when_asked() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        spawn_periodic(DAY, Duration::from_millis(10), true, move || {
            let tx = tx.clone();
            async move {
                let _ = tx.send(());
            }
        });
        tokio::time::timeout(Duration::from_secs(5), rx.recv())
            .await
            .expect("ran at start")
            .unwrap();
        // Not again before a day has passed.
        assert!(tokio::time::timeout(Duration::from_millis(100), rx.recv())
            .await
            .is_err());
    }
}
