const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, index: true },
    walletAddress: { type: String, default: "", index: true },
    trustScore: { type: Number, default: 50, min: 0, max: 100 },
    botScore: { type: Number, default: 50, min: 0, max: 100 },
    isHumanVerified: { type: Boolean, default: false },
    socialHandle: { type: String, default: "" },
    socialUrl: { type: String, default: "" },
    faceCaptureDataUrl: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);

