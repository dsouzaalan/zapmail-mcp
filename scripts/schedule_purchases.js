#!/usr/bin/env node

import { spawn } from 'child_process';

// Configuration
const WORKSPACE_KEY = "a187a10b-089a-464b-9684-0ce46c007108";
const DOMAINS_TO_PURCHASE = [
    "coldomni.com",
    "gtzpro.com", 
    "saasoptima.com",
    "coldoptima.com",
    "gtmproapp.com"
];

// Rate limiting configuration
const INITIAL_DELAY = 10000; // 10 seconds
const MAX_RETRIES = 5;
const BACKOFF_MULTIPLIER = 2;
const BATCH_SIZE = 1; // Purchase one domain at a time to minimize rate limits

class PurchaseScheduler {
    constructor() {
        this.currentIndex = 0;
        this.successfulPurchases = [];
        this.failedPurchases = [];
        this.currentDelay = INITIAL_DELAY;
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async executeCommand(command) {
        return new Promise((resolve, reject) => {
            const child = spawn('node', ['index.js'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            let errorOutput = '';

            child.stdout.on('data', (data) => {
                output += data.toString();
            });

            child.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve(output);
                } else {
                    reject(new Error(`Command failed with code ${code}: ${errorOutput}`));
                }
            });

            child.stdin.write(command + '\n');
            child.stdin.end();
        });
    }

    async setWorkspace() {
        const command = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/invoke",
            params: {
                tool_name: "set_context",
                input: { workspaceKey: WORKSPACE_KEY }
            }
        });

        try {
            await this.executeCommand(command);
            console.log('✅ Workspace set to "Prewarm - August"');
        } catch (error) {
            console.error('❌ Failed to set workspace:', error.message);
            throw error;
        }
    }

    async purchaseDomain(domain, retryCount = 0) {
        const command = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/invoke",
            params: {
                tool_name: "purchase_domains",
                input: {
                    domains: [domain],
                    years: 1,
                    preferWallet: true
                }
            }
        });

        try {
            console.log(`🔄 Attempting to purchase: ${domain} (attempt ${retryCount + 1})`);
            const result = await this.executeCommand(command);
            
            // Check if the response contains an error
            if (result.includes('"error"')) {
                throw new Error('API returned an error');
            }
            
            console.log(`✅ Successfully purchased: ${domain}`);
            this.successfulPurchases.push(domain);
            return true;
        } catch (error) {
            console.error(`❌ Failed to purchase ${domain}:`, error.message);
            
            if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
                if (retryCount < MAX_RETRIES) {
                    const delay = this.currentDelay * Math.pow(BACKOFF_MULTIPLIER, retryCount);
                    console.log(`⏳ Rate limited. Waiting ${delay/1000} seconds before retry...`);
                    await this.sleep(delay);
                    return this.purchaseDomain(domain, retryCount + 1);
                } else {
                    console.log(`❌ Max retries reached for ${domain}`);
                    this.failedPurchases.push(domain);
                    return false;
                }
            } else {
                console.log(`❌ Non-rate-limit error for ${domain}`);
                this.failedPurchases.push(domain);
                return false;
            }
        }
    }

    async processBatch() {
        const batch = DOMAINS_TO_PURCHASE.slice(this.currentIndex, this.currentIndex + BATCH_SIZE);
        
        for (const domain of batch) {
            const success = await this.purchaseDomain(domain);
            
            if (success) {
                // If successful, wait a bit before next purchase
                await this.sleep(5000);
            } else {
                // If failed due to rate limit, wait longer
                await this.sleep(this.currentDelay);
            }
        }
        
        this.currentIndex += BATCH_SIZE;
    }

    async run() {
        console.log('🚀 Starting scheduled domain purchases...');
        console.log(`📋 Domains to purchase: ${DOMAINS_TO_PURCHASE.join(', ')}`);
        console.log(`⏰ Initial delay: ${INITIAL_DELAY/1000} seconds`);
        console.log(`🔄 Max retries: ${MAX_RETRIES}`);
        console.log(`📦 Batch size: ${BATCH_SIZE}`);
        console.log('');

        try {
            // Set workspace first
            await this.setWorkspace();
            await this.sleep(2000);

            // Process all domains
            while (this.currentIndex < DOMAINS_TO_PURCHASE.length) {
                await this.processBatch();
                
                if (this.currentIndex < DOMAINS_TO_PURCHASE.length) {
                    console.log(`⏳ Waiting ${this.currentDelay/1000} seconds before next batch...`);
                    await this.sleep(this.currentDelay);
                }
            }

            // Final summary
            console.log('');
            console.log('📊 Purchase Summary:');
            console.log(`✅ Successfully purchased: ${this.successfulPurchases.length}`);
            console.log(`❌ Failed purchases: ${this.failedPurchases.length}`);
            
            if (this.successfulPurchases.length > 0) {
                console.log('✅ Purchased domains:');
                this.successfulPurchases.forEach(domain => console.log(`   - ${domain}`));
            }
            
            if (this.failedPurchases.length > 0) {
                console.log('❌ Failed domains:');
                this.failedPurchases.forEach(domain => console.log(`   - ${domain}`));
            }

        } catch (error) {
            console.error('💥 Fatal error:', error.message);
            process.exit(1);
        }
    }
}

// Run the scheduler
const scheduler = new PurchaseScheduler();
scheduler.run().catch(console.error);
