// Where a room player meets their optional account.
//
// Rooms never need an account (CLAUDE.md rule 1). When a signed-in player is
// in a room, though, three things should carry over without any extra step:
//
//   * their look -- name, preset or drawn picture, Gahook form -- is saved to
//     the account whenever they join, edit their profile or pick a form, so
//     the join screen on any other device starts from it;
//   * their saved custom Gahooks are loaded into the room player's slots;
//   * signing in from inside a room ("linking") uploads the custom Gahooks the
//     guest already drew there into empty account slots, and fills empty room
//     slots from the account. Nothing that exists is overwritten either way.
//
// Saving is best effort and never delays or fails a room command: a database
// outage costs a player their saved look, not their game.

import { normaliseCustomGahook, publicCustomGahook } from "./custom-gahook.mjs";
import { roomAssetDataUrl } from "./media.mjs";

/**
 * @param {object} deps
 * @param {object} deps.accountService           from createAccountService
 * @param {(room: object, value: object) => object} deps.portableCustomGahook  room media -> data URLs
 * @param {(player: object, slot: number, value: object) => void} deps.rememberCustomGahookSlot
 * @param {(player: object, slot: number) => object} deps.customGahookForSlot
 * @param {(accountView: object | null) => number} deps.customGahookSlotCount
 * @param {(message: string, detail?: unknown) => void} [deps.log]
 */
export function createAccountRoomBridge(deps) {
  const {
    accountService,
    portableCustomGahook,
    rememberCustomGahookSlot,
    customGahookForSlot,
    customGahookSlotCount,
    log = (message, detail) => console.warn("[accounts]", message, detail ?? "")
  } = deps;

  function accountViewFor(account) {
    return account ? accountService.publicStatus(account).account : null;
  }

  /** The look to save, keeping what a restrictive room setting hid. */
  function profileFromPlayer(room, player, savedProfile) {
    // A host can switch off drawn pictures or custom Gahooks for one room. The
    // player's account choice should survive that room, not be replaced by
    // the fallback the room imposed.
    const avatarImageDataUrl = room.allowCustomProfiles === false ?
      savedProfile?.avatarImageDataUrl || "" :
      player.avatarImageDataUrl ? roomAssetDataUrl(room, player.avatarImageDataUrl, "image") : "";
    const gahookForm = room.allowCustomGahooks === false && savedProfile?.gahookForm === "custom" ?
      "custom" :
      player.gahookForm;
    return { playerName: player.name, avatarId: player.avatarId, avatarImageDataUrl, gahookForm };
  }

  /** Save the room player's look to their account. Never throws; resolves when done. */
  function rememberProfile(room, player, account) {
    if (!account || !player || player.accountId !== account.id) return Promise.resolve(false);
    const profile = profileFromPlayer(room, player, accountViewFor(account)?.profile);
    return accountService.saveProfile(account.id, profile).then(() => true, (error) => {
      log("saved profile could not be written", error?.code || error?.message || error);
      return false;
    });
  }

  /** Load saved account Gahooks into the room player's slots. */
  function restoreSavedGahooks(room, player, accountView, { onlyEmpty = true } = {}) {
    const saved = Array.isArray(accountView?.savedCustomGahooks) ? accountView.savedCustomGahooks : [];
    let restored = 0;
    for (const item of saved) {
      if (!(item.slot >= 0 && item.slot < (Number(player.customGahookSlots) || 0))) continue;
      if (onlyEmpty && customGahookForSlot(player, item.slot).frames.length) continue;
      try {
        const value = normaliseCustomGahook(room, item.configuration, publicCustomGahook());
        rememberCustomGahookSlot(player, item.slot, value);
        if (item.slot === (Number(player.customGahookSlot) || 0)) player.customGahook = value;
        restored += 1;
      } catch (error) {
        // Most likely the room's media budget is full. The account copy is
        // untouched and the slot can still be loaded in another room.
        log("saved custom Gahook could not be restored", error?.message || error);
      }
    }
    return restored;
  }

  /**
   * Attach a signed-in account to a room player who joined as a guest, and
   * merge their custom Gahooks both ways without overwriting either side.
   */
  async function link(room, player, account) {
    const accountView = accountViewFor(account);
    player.accountId = account.id;
    player.customGahookSlots = customGahookSlotCount(accountView);
    player.customGahookSlot = Math.max(0, Math.min(player.customGahookSlots - 1, Number(player.customGahookSlot) || 0));
    const savedSlots = new Set((accountView?.savedCustomGahooks || []).map((item) => item.slot));
    let uploaded = 0;
    for (let slot = 0; slot < Math.min(player.customGahookSlots, accountView?.customGahookSlots || 0); slot += 1) {
      const roomValue = customGahookForSlot(player, slot);
      if (!roomValue.frames.length || savedSlots.has(slot)) continue;
      try {
        await accountService.saveCustomGahook(account.id, slot, portableCustomGahook(room, roomValue));
        uploaded += 1;
      } catch (error) {
        log("room custom Gahook could not be saved to the account", error?.code || error?.message || error);
      }
    }
    const restored = restoreSavedGahooks(room, player, accountView, { onlyEmpty: true });
    if (!accountView?.profile) await rememberProfile(room, player, account);
    return { uploaded, restored };
  }

  /** After an account is deleted, no room player may keep pointing at it. */
  function detachAccount(rooms, accountId) {
    const touched = [];
    for (const room of rooms) {
      let changed = false;
      for (const player of Object.values(room.players || {})) {
        if (player.accountId !== accountId) continue;
        player.accountId = "";
        player.customGahookSlots = customGahookSlotCount(null);
        player.customGahookSlot = Math.max(0, Math.min(player.customGahookSlots - 1, Number(player.customGahookSlot) || 0));
        changed = true;
      }
      if (changed) touched.push(room);
    }
    return touched;
  }

  return { detachAccount, link, rememberProfile, restoreSavedGahooks };
}
