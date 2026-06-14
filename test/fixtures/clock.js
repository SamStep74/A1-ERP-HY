// A1 ERP-HY Test Clock Fixture
//
// Wraps the global `Date` object with a deterministic, steppable clock so
// session tests can exercise time-based guards (MFA, hard limit, idle
// timeout) without ever calling `setTimeout` or `setInterval`.
//
// Usage:
//   const clock = useFakeClock();           // install (returns the clock)
//   clock.set(new Date('2030-01-01T00:00Z'));
//   clock.tick(60 * 60 * 1000);             // +1 hour
//   // ...assertions using Date.now() / new Date() ...
//   clock.restore();                        // tear down (always call in finally)
//
// Implementation notes:
//   - We replace `globalThis.Date` with a class that mirrors the real Date
//     API (constructor, now, parse, UTC) and delegates to a single mutable
//     timestamp. This is enough for `Date.now()`, `new Date()`, and the
//     arithmetic guards in server/rbac/guards.js.
//   - We keep a reference to the original `Date` so `restore()` puts
//     everything back the way it was. We DO NOT touch `setTimeout` /
//     `setImmediate` / `setInterval` because none of the guards rely on
//     them — they only read `Date.now()` or `new Date(...).getTime()`.
//   - The clock is per-test: each call to `useFakeClock()` returns a fresh
//     instance. There is no global "now" shared across files. If a test
//     forgets to `restore()`, the rest of the suite sees a frozen clock,
//     which is a fast signal something is wrong.

'use strict';

const RealDate = Date;

class MockDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) {
      super(getCurrentMockMs());
    } else {
      super(...args);
    }
  }

  static now() {
    return getCurrentMockMs();
  }

  static parse(s) {
    return RealDate.parse(s);
  }

  static UTC(...args) {
    return RealDate.UTC(...args);
  }
}

// Module-level state. A test that uses the clock should never see this
// because the real Date is replaced with MockDate while active.
let _mockMs = null;
let _installed = false;
let _realNow = null;

function getCurrentMockMs() {
  if (!_installed || _mockMs === null) {
    return RealDate.now();
  }
  return _mockMs;
}

function useFakeClock(initialMs) {
  if (_installed) {
    throw new Error('useFakeClock: a fake clock is already installed. Call restore() first.');
  }
  _installed = true;
  _mockMs = typeof initialMs === 'number' ? initialMs : RealDate.now();
  if (typeof _realNow !== 'function') {
    _realNow = globalThis.Date.now.bind(globalThis.Date);
  }
  globalThis.Date = MockDate;
  return {
    set(ms) { _mockMs = ms; },
    tick(deltaMs) { _mockMs += deltaMs; return _mockMs; },
    now() { return _mockMs; },
    restore,
  };
}

function restore() {
  if (!_installed) return;
  _installed = false;
  _mockMs = null;
  globalThis.Date = RealDate;
}

module.exports = { useFakeClock, restore, MockDate };
