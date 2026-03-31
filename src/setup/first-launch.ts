import fs from 'fs';
import path from 'path';
import readline from 'readline';
import type { ServiceContainer } from '../services/index.js';
import { handleSetupWorkflowReply, startSetupWorkflow } from '../tools/setup-workflow.js';

const DOC_FILES = [
  { filename: 'README.md', title: 'Bartleby README' },
  { filename: 'COMMANDS.md', title: 'Bartleby Commands' },
  { filename: 'TECH_SPEC.md', title: 'Bartleby Tech Spec' },
];

function importDocsToGarden(services: ServiceContainer): void {
  const cwd = process.cwd();

  for (const { filename, title } of DOC_FILES) {
    const filePath = path.join(cwd, filename);
    if (!fs.existsSync(filePath)) continue;

    const existing = services.garden.getByTitle(title);
    if (existing) continue;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      services.garden.create({ type: 'note', title, status: 'active', content });
    } catch {
      // Ignore best-effort import failures.
    }
  }
}

function promptLine(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const handler = (line: string) => {
      rl.removeListener('line', handler);
      resolve(line.trim());
    };
    rl.on('line', handler);
  });
}

async function runSetupWorkflowViaCli(rl: readline.Interface, services: ServiceContainer): Promise<void> {
  const intro = await startSetupWorkflow(services);
  console.log(`\n${intro}\n`);

  while (services.workflow.hasActive()) {
    const active = services.workflow.getActive();
    if (!active) break;

    const input = await promptLine(rl, '> ');
    const reply = await handleSetupWorkflowReply(input, { input, services }, active);
    console.log(`\n${reply}\n`);
  }
}

export async function runFirstLaunch(
  rl: readline.Interface,
  services: ServiceContainer
): Promise<void> {
  try {
    importDocsToGarden(services);
    await runSetupWorkflowViaCli(rl, services);
    console.log('✓ Setup complete! Type "help" to see what you can do.\n');
  } catch (err) {
    console.warn(`\n⚠ Setup encountered an error: ${String(err)}`);
    console.warn('You can re-run setup later with: setup wizard\n');
    try { services.settings.markFirstRunComplete(); } catch { /* ignore */ }
  }
}
