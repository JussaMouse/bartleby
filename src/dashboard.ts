import { createDashboardConnector } from './dashboard/connector.js';

async function main() {
  const connector = createDashboardConnector();

  console.log('\nBartleby dashboard placeholder');
  console.log('The legacy dashboard implementation has been removed.');
  console.log('A future dashboard should connect to shared Bartleby runtime behavior.\n');
  console.log(JSON.stringify(connector, null, 2));
}

main().catch((err) => {
  console.error('Dashboard placeholder failed', err);
  process.exit(1);
});
