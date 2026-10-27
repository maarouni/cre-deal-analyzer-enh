// SHA-256 hashes only — the actual password and PINs never ship in the
// bundle, so `view-source` / dev tools can't reveal them directly.
// (Note: this raises the bar against casual snooping, not against anyone
// who tries — see the caveat given alongside this file.)
//
// Never write the plaintext password or PINs in this file: the repo is public.
// To change one, regenerate its hash — see instructions at the bottom of this file.

export const APP_PASSWORD_HASH =
  "9633cf3bcf9a8de0b8317a24ef1eef7cc1a25f6bd62ad6f590fe9c0f58f9dc65";

export const PIN_HASH_TO_NAME = {
  "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4": "masoud",
  "0b3fe555ae8bd943feae4fb5e9ee5bebc608cafec26b75fe281b245ba635edc8": "Devon Mendoza",
  "03214801f88d8260a84691f80af8839a03b18a97e85878b9c3028d48c6656727": "Robert Hefty",
  "9cd129f891c52ec5e398bb70d3289954935a42d882e9739eb01e925d51980c4a": "Tyler Humes",
};

// To add/change a PIN or the password, generate its SHA-256 hex hash and
// paste it in above. In a terminal:
//   node -e 'console.log(require("crypto").createHash("sha256").update("NEW_VALUE_HERE").digest("hex"))'
