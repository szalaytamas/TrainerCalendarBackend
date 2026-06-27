/**
 * Egyszeri migrációs script: userPackages.packages[] array -> subcollection
 *
 * Futtatás (a backend-clean-again mappából):
 *   node src/scripts/migrateUserPackages.js
 *
 * A script biztonságos: az eredeti dokumentumot csak akkor törli, ha
 * minden subcollection dokumentum sikeresen létrejött.
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const admin = require("firebase-admin");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

async function migrate() {
    console.log("▶ userPackages migráció indítása...");

    const snapshot = await db.collection("userPackages").get();

    if (snapshot.empty) {
        console.log("✅ Nincs migrálandó dokumentum.");
        process.exit(0);
    }

    let migratedDocs = 0;
    let migratedPackages = 0;

    for (const doc of snapshot.docs) {
        const guestId = doc.id;
        const data = doc.data();
        const packages = data.packages;

        if (!packages || !Array.isArray(packages) || packages.length === 0) {
            console.log(`  ⏭ ${guestId}: nincs packages array, kihagyva`);
            continue;
        }

        console.log(`  → ${guestId}: ${packages.length} bérlet migrálása...`);

        const batch = db.batch();
        const subcollectionRef = db.collection("userPackages").doc(guestId).collection("packages");

        for (const pkg of packages) {
            const docId = pkg.id || subcollectionRef.doc().id;
            batch.set(subcollectionRef.doc(docId), { ...pkg, id: docId });
        }

        await batch.commit();

        await db.collection("userPackages").doc(guestId).update({
            packages: admin.firestore.FieldValue.delete()
        });

        migratedDocs++;
        migratedPackages += packages.length;
        console.log(`  ✅ ${guestId}: ${packages.length} bérlet sikeresen migrálva`);
    }

    console.log(`\n✅ Migráció kész: ${migratedDocs} vendég, ${migratedPackages} bérlet`);
    process.exit(0);
}

migrate().catch(err => {
    console.error("❌ Migráció sikertelen:", err);
    process.exit(1);
});
