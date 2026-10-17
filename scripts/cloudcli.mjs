#!/usr/bin/env node
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { parseArgs, parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { startGateway } from './cloudcli-gateway.mjs';
const home = process.env.CLAUDE_CLOUD_HOME || join(homedir(), '.local/share/claude-cloud');
const configFile = join(homedir(), '.config/claude-cloud/keys.env');
let gateway;
try {
  const { values } = parseArgs({ options: {
    account: { type: 'string', default: 'auto' }, port: { type: 'string' },
    'reset-accounts': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log(`사용: claude-cloud [--account auto|1|2] [--port 포트] [--reset-accounts]\n기본: auto, 3001. 계정 1 크레딧 소진 시 2로 전환.\n키: ${configFile}\n고정 계정은 자동 전환하지 않습니다. --reset-accounts로 우선 계정을 1로 초기화합니다.`);
  } else {
    if (!['auto', '1', '2'].includes(values.account)) throw new Error('--account는 auto, 1, 2 중 하나입니다.');
    const port = Number(values.port || (values.account === '2' ? '3002' : '3001'));
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('포트는 1024~65535 정수로 지정하세요.');
    const entry = resolve(home, 'cloudcli/node_modules/@cloudcli-ai/cloudcli/dist-server/server/modules/cli/cli.js');
    await access(entry);
    const config = { ...process.env, ...parseEnv(await readFile(configFile, 'utf8')) };
    const keys = { '1': config.ANTHROPIC_1_API_KEY, '2': config.ANTHROPIC_2_API_KEY };
    const env = { ...process.env };
    for (const name of Object.keys(env)) {
      if (name.startsWith('ANTHROPIC_') || name.startsWith('CLAUDE_CODE_USE_') ||
          ['CLAUDECODE', 'CLAUDE_CODE_SUBAGENT_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL_FORCE',
           'CLAUDE_CODE_DISABLE_1M_CONTEXT', 'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS',
           'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR'].includes(name)) delete env[name];
    }
    const state = resolve(home, 'state');
    await mkdir(state, { recursive: true, mode: 0o700 });
    const activeFile = join(state, 'active-account.json');
    let activeAccount = '1';
    try { activeAccount = JSON.parse(await readFile(activeFile, 'utf8')).account; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (values['reset-accounts']) activeAccount = '1';
    if (values.account === 'auto') {
      gateway = await startGateway({ keys, initialAccount: activeAccount,
        onSwitch: account => writeFile(activeFile, JSON.stringify({ account }), { mode: 0o600 }) });
      env.ANTHROPIC_API_KEY = gateway.token; env.ANTHROPIC_BASE_URL = gateway.url;
      if (values['reset-accounts']) await writeFile(activeFile, JSON.stringify({ account: '1' }), { mode: 0o600 });
    } else {
      if (!keys[values.account]) throw new Error(`${configFile}에 ANTHROPIC_${values.account}_API_KEY가 없습니다.`);
      env.ANTHROPIC_API_KEY = keys[values.account]; env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
    }
    env.HOST = '127.0.0.1'; env.SERVER_PORT = String(port); env.NODE_ENV = 'production';
    env.DATABASE_PATH = join(state, values.account === '2' ? 'account-2/auth.db' : 'account-1/auth.db');
    await mkdir(resolve(env.DATABASE_PATH, '..'), { recursive: true, mode: 0o700 });
    console.log(`CloudCLI · ${values.account === 'auto' ? `자동 전환 / 현재 계정 ${gateway.activeAccount()}` : `계정 ${values.account} 고정`} · http://127.0.0.1:${port}`);
    const child = spawn(process.execPath, [entry], { cwd: process.cwd(), env, stdio: 'inherit' });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
    child.on('error', async error => { console.error(error.message); await gateway?.close(); process.exitCode = 1; });
    child.on('exit', async code => { await gateway?.close(); process.exitCode = code ?? 1; });
  }
} catch (error) { console.error(error.message); await gateway?.close(); process.exitCode = 1; }
