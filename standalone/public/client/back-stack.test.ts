import assert from "node:assert/strict";
import test from "node:test";

import { BACK_STACK_MARK, type BackStack, createBackStack } from "./back-stack.ts";

/**
 * A browser history double. Like the real one, pushState is synchronous and
 * truncates forward entries, while go() (and the user's Back button) land
 * asynchronously and then fire popstate.
 */
function fakeBrowser(startPath = "/ROOM") {
  type Entry = { state: unknown; url: string };
  const entries: Entry[] = [{ state: null, url: startPath }];
  let index = 0;
  const current = (): Entry => entries[index] as Entry;
  const listeners = new Set<() => void>();
  const macrotasks: Array<() => void> = [];
  const microtasks: Array<() => void> = [];
  let pushes = 0;
  let travels = 0;

  const flushMicrotasks = () => {
    while (microtasks.length) (microtasks.shift() as () => void)();
  };
  const firePopState = () => {
    for (const listener of [...listeners]) listener();
    flushMicrotasks();
  };
  const traverse = (delta: number) => {
    macrotasks.push(() => {
      const target = Math.max(0, Math.min(entries.length - 1, index + delta));
      if (target === index) return;
      index = target;
      firePopState();
    });
  };
  const url = () => new URL(current().url, "http://gahookz.test");

  const history = {
    get state() {
      return current().state;
    },
    pushState(data: unknown, _unused: string, next?: string | null) {
      entries.splice(index + 1);
      entries.push({ state: structuredClone(data), url: next || current().url });
      index += 1;
      pushes += 1;
    },
    go(delta = 0) {
      travels += 1;
      traverse(delta);
    }
  };
  const location = {
    get pathname() {
      return url().pathname;
    },
    get search() {
      return url().search;
    },
    get hash() {
      return url().hash;
    }
  };

  return {
    env: {
      history,
      location,
      listen(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      setTimeout(handler: () => void) {
        // The travel watchdog; never needed when traversals do land.
        return handler;
      },
      clearTimeout() {},
      defer(task: () => void) {
        microtasks.push(task);
      }
    },
    /** End the current task only: deferred work runs, traversals stay pending. */
    endTask() {
      flushMicrotasks();
    },
    /** Finish the current task: run deferred work, then pending traversals. */
    settle() {
      flushMicrotasks();
      while (macrotasks.length) {
        (macrotasks.shift() as () => void)();
        flushMicrotasks();
      }
    },
    /** The person presses the browser's Back button. */
    back() {
      traverse(-1);
      this.settle();
    },
    forward() {
      traverse(1);
      this.settle();
    },
    /** What app.jsx navigateTo() does: push a new URL, dispatch popstate. */
    navigateTo(path: string) {
      entries.splice(index + 1);
      entries.push({ state: null, url: path });
      index += 1;
      firePopState();
    },
    get depth() {
      const mark = (current().state as Record<string, { depth: number }> | null)?.[BACK_STACK_MARK];
      return mark?.depth || 0;
    },
    get path() {
      return location.pathname;
    },
    get length() {
      return entries.length;
    },
    get pushes() {
      return pushes;
    },
    get travels() {
      return travels;
    }
  };
}

function setup(startPath = "/ROOM") {
  const browser = fakeBrowser(startPath);
  const stack: BackStack = createBackStack(browser.env);
  return { browser, stack };
}

test("the room guard adds one entry, and Back asks instead of leaving", () => {
  const { browser, stack } = setup();
  let asked = 0;
  stack.guard(() => {
    asked += 1;
  });
  browser.settle();
  assert.equal(browser.length, 2);
  assert.equal(browser.depth, 1);

  browser.back();
  assert.equal(asked, 1, "Back with nothing open asks to leave");
  assert.equal(browser.path, "/ROOM", "the room is still on screen");
  assert.equal(browser.depth, 0);
  assert.equal(browser.pushes, 1, "nothing is pushed until the player answers");

  stack.restoreGuard();
  assert.equal(browser.depth, 1, "No puts the guard entry straight back");
  assert.equal(browser.length, 2, "and history does not grow");
});

test("Back closes the open overlay and stays in the room", () => {
  const { browser, stack } = setup();
  let asked = 0;
  let closed = 0;
  stack.guard(() => {
    asked += 1;
  });
  browser.settle();
  const menu = stack.open(() => {
    closed += 1;
  });
  browser.settle();
  assert.equal(browser.depth, 2);

  browser.back();
  assert.equal(closed, 1, "the menu was told to close");
  assert.equal(asked, 0, "the room was not asked to leave");
  assert.equal(browser.depth, 1);

  // The menu's own effect cleanup then reports the close; nothing moves.
  const travels = browser.travels;
  stack.close(menu);
  browser.settle();
  assert.equal(browser.travels, travels);
  assert.equal(browser.depth, 1);
});

test("stacked overlays close one Back at a time, top first", () => {
  const { browser, stack } = setup();
  const closed: string[] = [];
  stack.guard(() => closed.push("room"));
  browser.settle();
  const menu = stack.open(() => closed.push("menu"));
  browser.settle();
  const creator = stack.open(() => closed.push("creator"));
  browser.settle();
  assert.equal(stack.isTop(creator), true);
  assert.equal(stack.isTop(menu), false);
  assert.equal(browser.depth, 3);

  browser.back();
  assert.deepEqual(closed, ["creator"]);
  assert.equal(stack.isTop(menu), true);
  browser.back();
  assert.deepEqual(closed, ["creator", "menu"]);
  browser.back();
  assert.deepEqual(closed, ["creator", "menu", "room"]);
});

test("closing an overlay by its own button consumes its entry", () => {
  const { browser, stack } = setup();
  let asked = 0;
  let closedByBack = 0;
  stack.guard(() => {
    asked += 1;
  });
  browser.settle();
  const dialog = stack.open(() => {
    closedByBack += 1;
  });
  browser.settle();
  assert.equal(browser.length, 3);

  stack.close(dialog);
  browser.settle();
  assert.equal(browser.depth, 1, "back on the guard entry");
  assert.equal(closedByBack, 0, "a self-close is not reported back to the overlay");
  assert.equal(asked, 0, "consuming the entry is not a Back press");

  // Opening and closing repeatedly never grows history beyond one entry.
  for (let round = 0; round < 5; round += 1) {
    const again = stack.open(() => {});
    browser.settle();
    stack.close(again);
    browser.settle();
  }
  assert.equal(browser.depth, 1);
  browser.back();
  assert.equal(asked, 1, "the next Back reaches the room guard");
});

test("a close and an open in the same tick reuse the entry (menu -> profile editor)", () => {
  const { browser, stack } = setup();
  stack.guard(() => {});
  browser.settle();
  const menu = stack.open(() => {});
  browser.settle();
  const pushes = browser.pushes;
  const travels = browser.travels;

  stack.close(menu);
  const editor = stack.open(() => {});
  browser.settle();
  assert.equal(browser.pushes, pushes, "no new entry");
  assert.equal(browser.travels, travels, "no traversal");
  assert.equal(browser.depth, 2);
  assert.equal(stack.isTop(editor), true);
});

test("an open that arrives while a traversal is in flight waits for it", () => {
  const { browser, stack } = setup();
  stack.guard(() => {});
  browser.settle();
  const menu = stack.open(() => {});
  browser.settle();

  // The close and the open land in separate tasks: the traversal for the
  // close has started but not arrived when the open happens.
  stack.close(menu);
  browser.endTask();
  assert.equal(browser.travels, 1);
  const pushes = browser.pushes;
  const editor = stack.open(() => {});
  browser.endTask();
  assert.equal(browser.pushes, pushes, "nothing is pushed mid-traversal");
  browser.settle();
  assert.equal(browser.depth, 2, "the editor ends with its own entry");
  assert.equal(browser.length, 3, "and history holds exactly guard + editor");
  assert.equal(stack.isTop(editor), true);
});

test("leaving the room forgets its overlays without closing them", () => {
  const { browser, stack } = setup();
  let closed = 0;
  const release = stack.guard(() => {});
  browser.settle();
  const menu = stack.open(() => {
    closed += 1;
  });
  browser.settle();

  // "Exit Lobby" in the menu: navigateTo("/").
  browser.navigateTo("/");
  assert.equal(browser.path, "/");
  const travels = browser.travels;
  stack.close(menu);
  release();
  browser.settle();
  assert.equal(browser.travels, travels, "no traversal back into the room");
  assert.equal(browser.path, "/");
  assert.equal(closed, 0);
  assert.equal(stack.wanted(), 0);
});

test("a second Back while Leave game? is showing leaves normally", () => {
  const { browser, stack } = setup("/");
  browser.navigateTo("/ROOM");
  let asked = 0;
  stack.guard(() => {
    asked += 1;
  });
  browser.settle();
  browser.back();
  assert.equal(asked, 1);
  assert.equal(browser.path, "/ROOM");
  browser.back();
  assert.equal(browser.path, "/", "the second Back goes where Back always went");
  assert.equal(asked, 1);
});

test("arriving on a stale overlay entry travels down to the guard", () => {
  const { browser, stack } = setup("/");
  browser.navigateTo("/ROOM");
  stack.guard(() => {});
  browser.settle();
  const menu = stack.open(() => {});
  browser.settle();
  browser.navigateTo("/");
  stack.close(menu);
  browser.settle();

  // Back from the welcome screen lands on the menu's old entry (depth 2)...
  browser.back();
  assert.equal(browser.path, "/ROOM");
  assert.equal(browser.depth, 2);
  // ...and when the room mounts its guard again, the stack settles at depth 1.
  let asked = 0;
  stack.guard(() => {
    asked += 1;
  });
  browser.settle();
  assert.equal(browser.depth, 1);
  browser.back();
  assert.equal(asked, 1);
});

test("releasing the guard while its entry is current consumes the entry", () => {
  const { browser, stack } = setup();
  const release = stack.guard(() => {});
  browser.settle();
  assert.equal(browser.depth, 1);
  // A kicked player is no longer in the room; Back must behave normally.
  release();
  browser.settle();
  assert.equal(browser.depth, 0);
});

test("Forward onto an old entry closes nothing and the next Back is neutral", () => {
  const { browser, stack } = setup();
  let asked = 0;
  stack.guard(() => {
    asked += 1;
  });
  browser.settle();
  const dialog = stack.open(() => {});
  browser.settle();
  browser.back();
  stack.close(dialog);
  browser.settle();
  browser.forward();
  assert.equal(browser.depth, 2);
  browser.back();
  assert.equal(asked, 0, "returning from the stale entry is not a request to leave");
  assert.equal(browser.depth, 1);
});
