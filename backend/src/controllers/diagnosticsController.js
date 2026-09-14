import { runFullDiagnostics } from '../services/diagnosticsService.js';

export async function getDiagnosticsJson(req, res) {
  try {
    const report = await runFullDiagnostics();
    const statusCode = report.overallStatus === 'CRITICAL' ? 503 : 200;
    res.status(statusCode).json(report);
  } catch (err) {
    res.status(500).json({
      overallStatus: 'ERROR',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
}

export async function getDiagnosticsHtml(req, res) {
  try {
    const report = await runFullDiagnostics();
    
    const isHealthy = report.overallStatus === 'HEALTHY';
    const isCritical = report.overallStatus === 'CRITICAL';
    const statusColor = isHealthy ? '#10b981' : (isCritical ? '#ef4444' : '#f59e0b');
    const statusBg = isHealthy ? 'rgba(16, 185, 129, 0.15)' : (isCritical ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)');

    const serviceRows = report.services.map(s => {
      const isSvcHealthy = s.status === 'HEALTHY';
      const isSvcDegraded = s.status.includes('DEGRADED');
      const badgeBg = isSvcHealthy ? '#065f46' : (isSvcDegraded ? '#78350f' : '#7f1d1d');
      const badgeColor = isSvcHealthy ? '#34d399' : (isSvcDegraded ? '#fbbf24' : '#f87171');
      const latencyBadge = s.latencyMs !== undefined ? `<span style="background:#1f2937; color:#9ca3af; padding:3px 8px; border-radius:6px; font-size:12px; font-family:monospace;">${s.latencyMs}ms</span>` : '';

      let detailsHtml = '';
      if (s.details) {
        detailsHtml = Object.entries(s.details)
          .map(([k, v]) => `<div><span style="color:#6b7280;">${k}:</span> <span style="color:#e5e7eb; font-weight:500;">${v}</span></div>`)
          .join('');
      }
      if (s.error) {
        detailsHtml += `<div style="color:#f87171; margin-top:6px; font-size:13px;"><strong>Error:</strong> ${s.error}</div>`;
      }
      if (s.fallbackActive) {
        detailsHtml += `<div style="color:#60a5fa; margin-top:4px; font-size:12px;">🛡️ <strong>Active Fallback:</strong> ${s.fallbackActive}</div>`;
      }
      if (s.recommendation) {
        detailsHtml += `<div style="background:#18181b; border-left:3px solid #f59e0b; padding:6px 10px; margin-top:8px; border-radius:4px; font-size:12px; color:#d1d5db;">💡 <strong>Fix:</strong> ${s.recommendation}</div>`;
      }

      return `
        <div style="background:#18181b; border:1px solid #27272a; border-radius:12px; padding:18px; margin-bottom:14px; box-shadow:0 4px 12px rgba(0,0,0,0.3);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
            <div>
              <div style="font-size:16px; font-weight:600; color:#f9fafb;">${s.name}</div>
              <div style="font-size:12px; color:#9ca3af; margin-top:2px;">${s.category}</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              ${latencyBadge}
              <span style="background:${badgeBg}; color:${badgeColor}; font-weight:600; padding:4px 10px; border-radius:8px; font-size:12px; letter-spacing:0.5px;">${s.status}</span>
            </div>
          </div>
          <div style="font-size:13px; line-height:1.6; border-top:1px solid #27272a; padding-top:10px;">
            ${detailsHtml}
          </div>
        </div>
      `;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WatchVibe System Diagnostics & Health Status</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #09090b; color: #f4f4f5; margin:0; padding:24px; }
    .container { max-width: 960px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #27272a; padding-bottom: 20px; margin-bottom: 24px; }
    .btn { background: #2563eb; color: #fff; padding: 8px 16px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500; cursor: pointer; border: none; }
    .btn:hover { background: #1d4ed8; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .metric-card { background: #18181b; border: 1px solid #27272a; border-radius: 10px; padding: 14px; text-align: center; }
    .metric-val { font-size: 20px; font-weight: 700; color: #60a5fa; margin-top: 4px; }
    .metric-label { font-size: 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1 style="margin:0; font-size:26px; font-weight:700;">WatchVibe System Diagnostics</h1>
        <p style="margin:4px 0 0 0; color:#a1a1aa; font-size:14px;">Real-Time Multi-Cloud & AI Infrastructure Health Monitor</p>
      </div>
      <div style="display:flex; gap:10px; align-items:center;">
        <button class="btn" onclick="window.location.reload()">🔄 Refresh Probe</button>
        <a href="/api/health/diagnostics" target="_blank" class="btn" style="background:#27272a; border:1px solid #3f3f46;">View JSON API</a>
      </div>
    </div>

    <!-- Status Banner -->
    <div style="background:${statusBg}; border:1px solid ${statusColor}; border-radius:12px; padding:18px 24px; margin-bottom:24px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-size:12px; text-transform:uppercase; letter-spacing:1px; color:${statusColor}; font-weight:700;">Overall System Health</div>
        <div style="font-size:24px; font-weight:800; color:${statusColor}; margin-top:2px;">${report.overallStatus}</div>
      </div>
      <div style="text-align:right;">
        <div style="color:#9ca3af; font-size:12px;">Diagnostic Latency</div>
        <div style="color:#e4e4e7; font-size:18px; font-family:monospace; font-weight:600;">${report.totalDiagnosticLatencyMs} ms</div>
      </div>
    </div>

    <!-- Metric Cards -->
    <div class="grid">
      <div class="metric-card">
        <div class="metric-label">Healthy Services</div>
        <div class="metric-val" style="color:#34d399;">${report.summary.healthyCount} / ${report.summary.totalServicesChecked}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Uptime</div>
        <div class="metric-val">${report.systemMetrics.uptime}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">RAM (Heap / RSS)</div>
        <div class="metric-val">${report.systemMetrics.memoryUsage.heapUsedMb}M / ${report.systemMetrics.memoryUsage.rssMb}M</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Node Environment</div>
        <div class="metric-val" style="font-size:16px; margin-top:8px;">${report.systemMetrics.nodeVersion} (${report.systemMetrics.environment})</div>
      </div>
    </div>

    <!-- Service Probes -->
    <h2 style="font-size:18px; font-weight:600; margin-bottom:14px; color:#e4e4e7;">Dependency Probes & Service Health</h2>
    <div>
      ${serviceRows}
    </div>

    <div style="margin-top:28px; text-align:center; color:#71717a; font-size:12px;">
      Probe executed at ${report.timestamp} &bull; WatchVibe Enterprise Recommendation Architecture
    </div>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    res.status(500).send(`<h1>Error running diagnostics</h1><p>${err.message}</p>`);
  }
}
