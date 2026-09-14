#!/usr/bin/env node
/**
 * WatchVibe Enterprise System Health Check & Diagnostics CLI
 * Tests all 3rd-party services, AI models, vector stores, graph databases, and local caches.
 * Run via: npm run test:system or node scripts/system_health_check.mjs
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import { loadSampleMovies } from '../src/services/movieData.js';
import { runFullDiagnostics } from '../src/services/diagnosticsService.js';
import { driver } from '../src/core/2_config.js';
import redisclient from '../src/config/redis.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

async function main() {
  console.log(`\n${BOLD}${CYAN}============================================================${RESET}`);
  console.log(`${BOLD}${CYAN}      WATCHVIBE ENTERPRISE SYSTEM HEALTH CHECK & AUDIT       ${RESET}`);
  console.log(`${BOLD}${CYAN}============================================================${RESET}\n`);

  console.log(`${DIM}Initializing local environment and database connections...${RESET}`);

  try {
    await connectDB();
  } catch (err) {
    console.error(`${RED}MongoDB initial connect failed: ${err.message}${RESET}`);
  }

  loadSampleMovies();

  console.log(`${DIM}Probing live external cloud APIs, vector indices, and graph nodes...\n${RESET}`);

  const report = await runFullDiagnostics();

  console.log(`------------------------------------------------------------`);
  console.log(`${BOLD}Overall Status:${RESET} ${
    report.overallStatus === 'HEALTHY'
      ? `${GREEN}${BOLD}✔ HEALTHY${RESET}`
      : report.overallStatus === 'CRITICAL'
      ? `${RED}${BOLD}✖ CRITICAL FAILURE${RESET}`
      : `${YELLOW}${BOLD}⚠ ${report.overallStatus}${RESET}`
  }  ${DIM}(Diagnostic latency: ${report.totalDiagnosticLatencyMs}ms)${RESET}`);
  console.log(`------------------------------------------------------------\n`);

  console.log(`${BOLD}SYSTEM METRICS:${RESET}`);
  console.log(`  Uptime:       ${report.systemMetrics.uptime}`);
  console.log(`  Node Version: ${report.systemMetrics.nodeVersion} (${report.systemMetrics.platform}/${report.systemMetrics.arch})`);
  console.log(`  RAM Heap:     ${report.systemMetrics.memoryUsage.heapUsedMb} MB used / ${report.systemMetrics.memoryUsage.heapTotalMb} MB total (RSS: ${report.systemMetrics.memoryUsage.rssMb} MB)\n`);

  console.log(`${BOLD}SERVICE STATUS BREAKDOWN:${RESET}`);
  
  for (const svc of report.services) {
    const isHealthy = svc.status === 'HEALTHY';
    const isDegraded = svc.status.includes('DEGRADED');
    const icon = isHealthy ? `${GREEN}✔ [HEALTHY]${RESET}` : (isDegraded ? `${YELLOW}⚠ [DEGRADED]${RESET}` : `${RED}✖ [DOWN]${RESET}`);
    const latencyStr = svc.latencyMs !== undefined ? `${DIM}(${svc.latencyMs}ms)${RESET}` : '';

    console.log(`\n  ${icon} ${BOLD}${svc.name}${RESET} ${latencyStr}`);
    console.log(`    Category: ${svc.category}`);

    if (svc.details) {
      const detailsList = Object.entries(svc.details).map(([k, v]) => `${k}: ${v}`).join(' | ');
      console.log(`    Details:  ${DIM}${detailsList}${RESET}`);
    }
    if (svc.fallbackActive) {
      console.log(`    ${CYAN}Fallback: ${svc.fallbackActive}${RESET}`);
    }
    if (svc.error) {
      console.log(`    ${RED}Error:    ${svc.error}${RESET}`);
    }
    if (svc.recommendation) {
      console.log(`    ${YELLOW}Action:   ${svc.recommendation}${RESET}`);
    }
  }

  console.log(`\n${BOLD}${CYAN}============================================================${RESET}`);
  console.log(`Diagnostic completed. ${report.summary.healthyCount}/${report.summary.totalServicesChecked} services healthy.`);
  console.log(`${BOLD}${CYAN}============================================================${RESET}\n`);

  // Cleanup connections
  try {
    if (driver) await driver.close();
    await redisclient.disconnect().catch(() => {});
    await mongoose.disconnect();
  } catch (e) { /* ignore */ }

  process.exit(report.overallStatus === 'CRITICAL' ? 1 : 0);
}

main().catch(err => {
  console.error(`${RED}Fatal diagnostics runner error:${RESET}`, err);
  process.exit(1);
});
