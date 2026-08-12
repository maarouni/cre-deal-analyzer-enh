// SHA-256 hashes only — the actual password and PINs never ship in the
// bundle, so `view-source` / dev tools can't reveal them directly.
// (Note: this raises the bar against casual snooping, not against anyone
// who tries — see the caveat given alongside this file.)
//
// Password: InvestAgent_Full1!
// PINs: masoud 1234, andy 7788, colin 8877, ali 5566, mark 4433,
// markfuruta 3344, michaelkaplan 4484, devon 5209, sunny 7042 (change any
// of these below to whatever you actually want, then regenerate its hash
// — see instructions at the bottom of this file).

export const APP_PASSWORD_HASH =
  "9633cf3bcf9a8de0b8317a24ef1eef7cc1a25f6bd62ad6f590fe9c0f58f9dc65";

export const PIN_HASH_TO_NAME = {
  "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4": "masoud",
  "16740bf13991fe083fbe5820cc8da08a5d88e5a48f44a3cfcc283c27b2797ba7": "andy",
  "1d5830bae2f8d81b1b0079c352ceab7df22f6f82453e6a2a736cd8b3649c10cf": "colin",
  "be41b7f1fa56ba2b0582910053c86cf6ee7e311efc51300220df0918bb9a287b": "ali",
  "8c059aad9e8b1f5304366e7cfdbfa778bfc4d5a748ff9559b8752dd286ee9076": "mark",
  "15fc36b3e80b9d7f87f7dc90cd7a2845c5d8501c30f03379fcf14154f1680380": "Mark Furuta",
  "8f33eff9c330b9e8348f8c96ab45d0de6f6c5311089a29bf8bf338d91a17a6f9": "bill",
  "a2713a5c710ced404167414fe1d7c38ff07eea0d146a71ae1c196587737bd0e8": "Michael Kaplan",
  "0b3fe555ae8bd943feae4fb5e9ee5bebc608cafec26b75fe281b245ba635edc8": "Devon Mendoza",
  "788fed4cefcf457afc6984efa7c19031a3325d2a93527293d2ced18bf9b7bb97": "Sunny Gill",
};

// To add/change a PIN or the password, generate its SHA-256 hex hash and
// paste it in above. In a terminal:
//   node -e 'console.log(require("crypto").createHash("sha256").update("NEW_VALUE_HERE").digest("hex"))'
