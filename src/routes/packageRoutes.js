const express = require("express");
const admin = require("firebase-admin");

const router = express.Router();
const db = admin.firestore();

const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.userId = decodedToken.uid;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// ─── Global packages (lookup table) ──────────────────────────────────────────

router.get("/", verifyToken, async (req, res) => {
    try {
        const snapshot = await db.collection("packages").get();
        const packages = snapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name,
            sessionCount: doc.data().sessionCount,
            durationDays: doc.data().durationDays,
            description: doc.data().description
        }));
        res.json(packages);
    } catch (err) {
        res.status(500).json({ error: "Hiba a bérletek lekérésekor" });
    }
});

router.post("/", verifyToken, async (req, res) => {
    try {
        const { name, sessionCount, durationDays, description } = req.body;

        if (!name || sessionCount === undefined || durationDays === undefined) {
            return res.status(400).json({ error: "Hiányzó adatok" });
        }

        const newPackage = { name, sessionCount, durationDays, description };
        const docRef = await db.collection("packages").add(newPackage);

        res.status(201).json({ id: docRef.id, ...newPackage, message: "Bérlet sikeresen létrehozva!" });
    } catch (err) {
        res.status(500).json({ error: "Hiba a bérlet létrehozásakor" });
    }
});

router.get("/:packageId", verifyToken, async (req, res) => {
    try {
        const { packageId } = req.params;
        const packageRef = db.collection("packages").doc(packageId);
        const doc = await packageRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: "Bérlet nem található" });
        }

        res.json({ id: doc.id, ...doc.data() });
    } catch (err) {
        res.status(500).json({ error: "Hiba a bérlet lekérésekor" });
    }
});

router.put("/:packageId", verifyToken, async (req, res) => {
    try {
        const { packageId } = req.params;
        const { name, sessionCount, durationDays, description } = req.body;

        const packageRef = db.collection("packages").doc(packageId);
        const doc = await packageRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: "Bérlet nem található" });
        }

        const updatedPackage = {
            name: name || doc.data().name,
            sessionCount: sessionCount !== undefined ? sessionCount : doc.data().sessionCount,
            durationDays: durationDays !== undefined ? durationDays : doc.data().durationDays,
            description: description || doc.data().description
        };

        await packageRef.update(updatedPackage);
        res.json({ message: "Bérlet sikeresen frissítve!", package: updatedPackage });
    } catch (err) {
        res.status(500).json({ error: "Hiba a bérlet frissítésekor" });
    }
});

router.delete("/:packageId", verifyToken, async (req, res) => {
    try {
        const { packageId } = req.params;
        const packageRef = db.collection("packages").doc(packageId);
        const doc = await packageRef.get();

        if (!doc.exists) {
            return res.status(404).json({ error: "Bérlet nem található" });
        }

        await packageRef.delete();
        res.json({ message: "Bérlet sikeresen törölve!" });
    } catch (err) {
        res.status(500).json({ error: "Hiba a bérlet törlésekor" });
    }
});

// ─── User packages (subcollection) ───────────────────────────────────────────

router.post("/assignPackage", verifyToken, async (req, res) => {
    try {
        const { guestId, packageId } = req.body;
        const packageRef = db.collection("packages").doc(packageId);
        const packageDoc = await packageRef.get();

        if (!packageDoc.exists) {
            return res.status(404).json({ error: "Bérlet nem található" });
        }

        const packageData = packageDoc.data();
        const startDate = new Date();
        const endDate = packageData.durationDays
            ? new Date(startDate.getTime() + packageData.durationDays * 24 * 60 * 60 * 1000)
            : null;

        // Create a new subcollection document ref so we can use its ID
        const newPackageDocRef = db.collection("userPackages").doc(guestId)
            .collection("packages").doc();

        const newPackage = {
            id: newPackageDocRef.id,
            packageId,
            name: packageData.name,
            sessionCount: packageData.sessionCount,
            durationDays: packageData.durationDays,
            description: packageData.description,
            startDate: admin.firestore.Timestamp.fromDate(startDate),
            endDate: endDate ? admin.firestore.Timestamp.fromDate(endDate) : null,
            remainingSessions: packageData.sessionCount
        };

        // Ensure the parent document exists before creating the subcollection
        await db.collection("userPackages").doc(guestId).set({ guestId }, { merge: true });
        await newPackageDocRef.set(newPackage);

        res.json({ message: "Bérlet sikeresen hozzárendelve!", package: newPackage });
    } catch (err) {
        res.status(500).json({ error: "Hiba a bérlet hozzárendelésekor" });
    }
});

router.get("/user-packages/:guestId", verifyToken, async (req, res) => {
    try {
        const { guestId } = req.params;

        const snapshot = await db.collection("userPackages").doc(guestId)
            .collection("packages")
            .get();

        if (snapshot.empty) {
            return res.status(404).json({ error: "A vendéghez nem tartozik bérlet." });
        }

        const now = new Date();
        const activePackages = [];
        const expiredPackages = [];

        snapshot.forEach(doc => {
            const pkg = doc.data();
            const endDate = pkg.endDate ? pkg.endDate.toDate() : null;
            const isUnlimited = pkg.packageId === "unlimited";
            const isExpiredByDate = endDate && endDate <= now;
            const isExpiredBySessions = !isUnlimited && pkg.remainingSessions !== undefined && pkg.remainingSessions <= 0;

            if (isExpiredByDate || isExpiredBySessions) {
                expiredPackages.push(pkg);
            } else {
                activePackages.push(pkg);
            }
        });

        res.json({ activePackages, expiredPackages });
    } catch (err) {
        res.status(500).json({ error: "Hiba a vendég bérleteinek lekérésekor" });
    }
});

router.put("/user-packages/:guestId", verifyToken, async (req, res) => {
    try {
        const { guestId } = req.params;
        const { attended, packageId } = req.body;

        if (typeof attended !== "boolean" || !packageId) {
            return res.status(400).json({ error: "Hiányzó vagy érvénytelen 'attended' érték" });
        }

        const packageRef = db.collection("userPackages").doc(guestId)
            .collection("packages").doc(packageId);
        const packageDoc = await packageRef.get();

        if (!packageDoc.exists) {
            return res.status(404).json({ error: "Bérlet nem található a vendégnél." });
        }

        const pkg = packageDoc.data();
        const isUnlimited = pkg.packageId === "unlimited";

        const newRemainingSessions = isUnlimited
            ? pkg.remainingSessions
            : attended
                ? Math.max(pkg.remainingSessions - 1, 0)
                : Math.min(pkg.remainingSessions + 1, pkg.sessionCount);

        await packageRef.update({ remainingSessions: newRemainingSessions });

        const updatedPackage = { ...pkg, remainingSessions: newRemainingSessions };
        res.json({ message: "Bérlet frissítve!", updatedPackage });
    } catch (err) {
        console.error("❌ Hiba a vendég bérletének frissítésekor:", err);
        res.status(500).json({ error: "Hiba a bérlet frissítésekor" });
    }
});

module.exports = router;
