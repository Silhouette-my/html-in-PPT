// One browser selection contract for preflight and screenshot export.
export function browserLaunchOptions(env = process.env) {
  return { headless: true, ...(env.HTML_DECK_BROWSER_CHANNEL ? { channel: env.HTML_DECK_BROWSER_CHANNEL } : {}) };
}
export function browserSelection(env = process.env) {
  return env.HTML_DECK_BROWSER_CHANNEL
    ? { source: 'system-channel', channel: env.HTML_DECK_BROWSER_CHANNEL }
    : { source: 'playwright', channel: 'chromium-headless-shell' };
}
export async function launchBrowser(chromium, env = process.env) {
  try { return await chromium.launch(browserLaunchOptions(env)); }
  catch (error) {
    throw new Error(`Browser could not start (${browserSelection(env).channel}). Install the bundled browser: npm run browser:install. Or use an installed Chrome/Edge:\nBash: HTML_DECK_BROWSER_CHANNEL=chrome npm run doctor\nPowerShell: $env:HTML_DECK_BROWSER_CHANNEL='chrome'; npm run doctor\nUse msedge instead of chrome for Edge; keep the variable set for npm run export. On Linux: npx playwright install --with-deps chromium.\n${error.message}`);
  }
}
