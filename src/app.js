const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const admin = require("firebase-admin");

dotenv.config();

let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  // Render.com (production): a teljes JSON string env változóban van
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // Helyi fejlesztés: GOOGLE_APPLICATION_CREDENTIALS fájlra mutat
  credential = admin.credential.applicationDefault();
} else {
  throw new Error(
    "Firebase credentials hiányoznak. Állítsd be a FIREBASE_SERVICE_ACCOUNT " +
    "vagy a GOOGLE_APPLICATION_CREDENTIALS env változót."
  );
}

admin.initializeApp({
  credential,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "fitnessapp-48d34.firebasestorage.app"
});

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "Backend is running!" });
});

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const guestRoutes = require("./routes/guestRoutes");
const exercisePlanRoutes = require("./routes/exercisePlanRoutes");
const packageRoutes = require("./routes/packageRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/guests", guestRoutes);
app.use("/api/exercise-plans", exercisePlanRoutes);
app.use("/api/packages", packageRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
