const { execFile } = require('child_process');
const path = require('path');

class WindowWatcher {
  constructor({ intervalMs = 2000, onChange } = {}) {
    this.intervalMs = intervalMs;
    this.onChange = onChange || (() => {});
    this.lastKey = null;
    this.timer = null;
    this.scriptPath = path.join(__dirname, 'get-active-window.ps1');
  }

  start() {
    if (this.timer) return;
    this.poll();
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  setInterval(ms) {
    this.intervalMs = ms;
    if (this.timer) {
      this.stop();
      this.start();
    }
  }

  poll() {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', this.scriptPath],
      { windowsHide: true, timeout: 4000 },
      (err, stdout) => {
        if (err || !stdout) return;
        const line = stdout.toString().trim();
        const sep = line.lastIndexOf('|');
        if (sep === -1) return;
        const processName = line.slice(0, sep).trim();
        const title = line.slice(sep + 1).trim();
        const key = `${processName}|${title}`;

        if (key !== this.lastKey) {
          this.lastKey = key;
          this.onChange({ processName, title });
        }
      }
    );
  }
}

module.exports = WindowWatcher;
