const admin = require('firebase-admin');

// Зчитуємо ключі з .env.local вручну
const fs = require('fs');
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    let key = match[1].trim();
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/\\n/g, '\n');
    }
    env[key] = val;
  }
});

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY,
  })
});

const db = admin.firestore();

async function check() {
  const snapshot = await db.collection('crm').doc('keepincrm_snapshot').get();
  console.log("Snapshot exists:", snapshot.exists);
  if (snapshot.exists) {
    const data = snapshot.data();
    console.log("Date:", data.date);
    console.log("Total Agreements:", data.totalAgreementsToday);
    console.log("Total Agreements Sum:", data.totalAgreementsSumToday);
    console.log("Agreements Array:", JSON.stringify(data.agreementsToday, null, 2));
  }
  
  const history = await db.collection('crm_keepincrm').orderBy('date', 'desc').limit(5).get();
  console.log("History documents:", history.size);
  history.forEach(doc => {
    const d = doc.data();
    console.log(doc.id, "=>", {
      date: d.date,
      totalAgreementsToday: d.totalAgreementsToday,
      totalAgreementsSumToday: d.totalAgreementsSumToday
    });
  });
}

check().catch(console.error).finally(() => process.exit(0));
