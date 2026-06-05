import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import admin from 'firebase-admin';
import bcrypt from 'bcryptjs';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('❌ Firebase credentials not found in .env.local');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey } as any)
});

const db = admin.firestore();

async function main() {
  console.log('🔍 Checking Firestore auth document...\n');

  const authDoc = await db.collection('crm').doc('auth').get();
  const authData = authDoc.exists ? authDoc.data()! : { credentials: [] };

  console.log('Current credentials in Firestore:');
  (authData.credentials || []).forEach((c: any) => {
    console.log(`  - userId: ${c.userId}, email: ${c.email}, role: ${c.role}`);
  });

  const NEW_PASSWORD = 'Admin2025!';
  const hash = await bcrypt.hash(NEW_PASSWORD, 10);

  if (!authData.credentials || authData.credentials.length === 0) {
    // No credentials at all — check state doc for first user
    const stateDoc = await db.collection('crm').doc('state').get();
    const stateData = stateDoc.exists ? stateDoc.data()! : { users: [] };
    const firstUser = stateData.users?.[0];

    if (!firstUser) {
      console.error('❌ No users found in Firestore state. Something went wrong.');
      process.exit(1);
    }

    authData.credentials = [{
      userId: firstUser.id,
      email: 'admin@pawell.com',
      passwordHash: hash,
      role: 'admin',
    }];

    // Also set email on user
    stateData.users[0].email = 'admin@pawell.com';
    await db.collection('crm').doc('state').set(stateData);

    console.log(`\n✅ Created new admin credentials for user: ${firstUser.name}`);
  } else {
    // Reset password for first admin (or first credential)
    const adminCred = authData.credentials.find((c: any) => c.role === 'admin') || authData.credentials[0];
    const idx = authData.credentials.indexOf(adminCred);
    authData.credentials[idx].passwordHash = hash;
    console.log(`\n✅ Resetting password for: ${adminCred.email}`);
  }

  await db.collection('crm').doc('auth').set(authData);

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║         НОВИЙ ПАРОЛЬ АДМІНА                 ║');
  console.log('╠══════════════════════════════════════════════╣');
  const email = authData.credentials.find((c: any) => c.role === 'admin')?.email || authData.credentials[0].email;
  console.log(`║  Email:    ${email.padEnd(34)}║`);
  console.log(`║  Пароль:   ${NEW_PASSWORD.padEnd(34)}║`);
  console.log('╚══════════════════════════════════════════════╝\n');

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
