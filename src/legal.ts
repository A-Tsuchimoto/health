export const PRIVACY_POLICY_HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy — wellness-mcp</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.7; color: #222; }
    h1 { font-size: 1.6rem; } h2 { font-size: 1.1rem; margin-top: 2rem; }
    p, li { font-size: 0.97rem; } ul { padding-left: 1.4rem; }
    footer { margin-top: 3rem; font-size: 0.85rem; color: #666; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p><strong>Last updated: 2026-05-07</strong></p>

  <p>wellness-mcp is a personal health data aggregation tool that connects
  Oura ring biometrics and SwitchBot environmental sensors to an AI assistant
  (claude.ai) via the Model Context Protocol (MCP). This policy describes
  how data is handled.</p>

  <h2>1. Data Collected</h2>
  <ul>
    <li><strong>Oura biometric data</strong> — daily sleep scores, readiness scores,
      activity scores, and heart rate samples retrieved from the Oura Cloud API on
      demand. This data is <em>not</em> stored persistently; it is fetched in real
      time when a query is made and returned directly to the user.</li>
    <li><strong>SwitchBot sensor data</strong> — temperature, humidity, and battery
      readings from Bluetooth environmental sensors, collected every 10 minutes and
      stored in a Cloudflare D1 database for historical queries.</li>
  </ul>

  <h2>2. Purpose of Processing</h2>
  <p>Data is processed solely to provide the operator with personal health and
  environmental insights through an AI assistant interface. No automated decisions
  are made based on this data.</p>

  <h2>3. Data Storage</h2>
  <ul>
    <li>SwitchBot sensor readings are stored in a Cloudflare D1 database
      (SQLite) located in Cloudflare's infrastructure. Only the operator has
      access via a Bearer token.</li>
    <li>Oura data is not stored. It is fetched on each request and discarded
      after the response is returned.</li>
    <li>No data is stored in logs beyond Cloudflare Workers' standard
      request logs (IP address, timestamp, HTTP status), which are retained
      per Cloudflare's own data retention policy.</li>
  </ul>

  <h2>4. Data Sharing</h2>
  <p>No personal health data is shared with any third party. The service is
  operated solely for the personal use of the operator. Cloudflare processes
  request metadata as the infrastructure provider, subject to
  <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare's Privacy Policy</a>.</p>

  <h2>5. Data Retention</h2>
  <p>SwitchBot sensor readings are retained indefinitely until the operator
  manually deletes them via the Cloudflare D1 console. The operator can delete
  all records at any time by running <code>DELETE FROM sensor_readings;</code>
  in the D1 console.</p>

  <h2>6. Security</h2>
  <p>All data is transmitted over HTTPS (TLS). Access to the MCP endpoint
  requires a Bearer token known only to the operator. API credentials
  (Oura, SwitchBot) are stored as encrypted Worker Secrets in Cloudflare
  and are never exposed in responses.</p>

  <h2>7. Your Rights</h2>
  <p>As this service is operated solely for the operator's personal use,
  the operator has full control over all stored data and can delete or
  export it at any time via the Cloudflare D1 console.</p>

  <h2>8. Contact</h2>
  <p>This service is a personal project. For questions, open an issue on the
  <a href="https://github.com/a-tsuchimoto/health">GitHub repository</a>.</p>

  <footer>wellness-mcp — personal health data MCP server</footer>
</body>
</html>`;

export const TERMS_OF_SERVICE_HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms of Service — wellness-mcp</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; line-height: 1.7; color: #222; }
    h1 { font-size: 1.6rem; } h2 { font-size: 1.1rem; margin-top: 2rem; }
    p, li { font-size: 0.97rem; } ul { padding-left: 1.4rem; }
    footer { margin-top: 3rem; font-size: 0.85rem; color: #666; }
  </style>
</head>
<body>
  <h1>Terms of Service</h1>
  <p><strong>Last updated: 2026-05-07</strong></p>

  <p>wellness-mcp is an open-source personal project that aggregates health
  and environmental data for personal use via the Model Context Protocol (MCP).
  By using this software, you agree to the following terms.</p>

  <h2>1. Personal Use Only</h2>
  <p>This service is intended solely for the personal use of the operator.
  It is not a commercial product and is not offered to the general public
  as a service.</p>

  <h2>2. Third-Party Services</h2>
  <p>This software integrates with the following third-party APIs. Use of
  those services is subject to their own terms:</p>
  <ul>
    <li><a href="https://cloud.ouraring.com/docs/terms">Oura API Terms of Service</a></li>
    <li><a href="https://www.switch-bot.com/pages/terms-of-services">SwitchBot Terms of Service</a></li>
    <li><a href="https://www.cloudflare.com/terms/">Cloudflare Terms of Service</a></li>
  </ul>
  <p>The operator is responsible for complying with each provider's terms when
  configuring and using this software with their credentials.</p>

  <h2>3. No Warranty</h2>
  <p>This software is provided <strong>"as is"</strong>, without warranty of
  any kind, express or implied. The authors make no guarantees regarding
  availability, accuracy, or fitness for any particular purpose.</p>

  <h2>4. Limitation of Liability</h2>
  <p>To the maximum extent permitted by applicable law, the authors shall not
  be liable for any direct, indirect, incidental, or consequential damages
  arising from the use or inability to use this software, including but not
  limited to loss of data or health-related decisions made based on data
  provided by this service.</p>

  <h2>5. Health Data Disclaimer</h2>
  <p>Data provided by this service is for informational and personal tracking
  purposes only. It does not constitute medical advice. Do not use this
  service to make clinical or medical decisions.</p>

  <h2>6. Open Source License</h2>
  <p>The source code is available under the MIT License. See the
  <a href="https://github.com/a-tsuchimoto/health">GitHub repository</a>
  for details.</p>

  <h2>7. Changes to These Terms</h2>
  <p>These terms may be updated at any time. Continued use of the service
  constitutes acceptance of the revised terms.</p>

  <footer>wellness-mcp — personal health data MCP server</footer>
</body>
</html>`;
