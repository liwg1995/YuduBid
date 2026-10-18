import { spawn } from 'node:child_process';

const token = process.env.ATOMGIT_ACCESS_TOKEN;
const owner = process.env.ATOMGIT_OWNER;
const repo = process.env.ATOMGIT_REPO;

if (![token, owner, repo].every(Boolean)) {
  throw new Error('ATOMGIT_ACCESS_TOKEN, ATOMGIT_OWNER and ATOMGIT_REPO are required');
}

function runGit(args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`git exited ${code}`)));
  });
}

async function main() {
  await runGit([
    'fetch', '--prune', 'origin',
    '+refs/heads/*:refs/mirror/heads/*',
    '+refs/tags/*:refs/tags/*',
  ]);

  const authorization = Buffer.from(`${owner}:${token}`, 'utf8').toString('base64');
  const gitEnv = {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.extraHeader',
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${authorization}`,
    GIT_TERMINAL_PROMPT: '0',
  };
  const remote = `https://gitcode.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}.git`;
  await runGit([
    'push', remote,
    'refs/mirror/heads/*:refs/heads/*',
    'refs/tags/*:refs/tags/*',
  ], gitEnv);
  console.log(`GitCode code mirror updated: ${owner}/${repo}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
