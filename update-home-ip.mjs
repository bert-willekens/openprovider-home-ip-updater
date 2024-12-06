#!/usr/bin/env node

import dotenv from 'dotenv';
import { setTimeout } from 'node:timers/promises';

dotenv.config();

class PublicIPResolver {
  constructor() {
    this.IP_SERVICES = [
      {
        url: 'https://api.ipify.org?format=json',
        parser: (data) => data.ip,
      },
      {
        url: 'https://api.ip.sb/ip',
        parser: (data) => data.trim(),
      },
      {
        url: 'https://api4.my-ip.io/ip.json',
        parser: (data) => data.ip,
      }
    ];
  }

  /**
   * Get the public IP address using various IP services
   * @returns {Promise<string>} The public IP address
   * @throws {Error} If unable to get IP from any service
   */
  async getPublicIP() {
    const errors = [];

    for (const service of this.IP_SERVICES) {
      try {
        const response = await fetch(service.url);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType?.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        const ip = service.parser(data);
        
        if (this.isValidIPv4(ip)) {
          return ip;
        }
        
        throw new Error(`Invalid IP address format: ${ip}`);
      } catch (error) {
        errors.push(error);
      }
    }

    throw new Error(
      `Failed to get public IP from all services. Errors: ${errors
        .map(e => e.message)
        .join(', ')}`
    );
  }

  /**
   * Validate IPv4 address format
   * @param {string} ip - The IP address to validate
   * @returns {boolean} True if valid IPv4 address
   */
  isValidIPv4(ip) {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipv4Regex.test(ip)) return false;
    
    const parts = ip.split('.').map(part => Number.parseInt(part, 10));
    return parts.every(part => part >= 0 && part <= 255);
  }
}

class OpenProviderDNSUpdater {
  /**
   * @param {Object} auth - Authentication credentials
   * @param {string} auth.username - OpenProvider username
   * @param {string} auth.password - OpenProvider password
   */
  constructor(auth) {
    this.auth = auth;
    this.token = null;
    this.BASE_URL = 'https://api.openprovider.eu';
    this.ipResolver = new PublicIPResolver();
  }

  /**
   * Make an API request to OpenProvider
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} API response
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token && { Authorization: `Bearer ${this.token}` }),
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API request failed: ${JSON.stringify(errorData)}`);
    }

    return response.json();
  }

  /**
   * Authenticate with OpenProvider API
   * @throws {Error} If authentication fails
   */
  async authenticate() {
    try {
      const response = await this.makeRequest('/v1beta/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: this.auth.username,
          password: this.auth.password,
        }),
      });

      this.token = response.data.token;
    } catch (error) {
      console.error('Authentication failed:', error);
      throw error;
    }
  }

  /**
   * Update DNS record
   * @param {string} domain - The domain name
   * @param {string} subdomain - The subdomain to update
   * @param {string} [newIp] - Optional IP address (will auto-detect if not provided)
   */
  async updateDNSRecord(domain, subdomain, newIp) {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      // If no IP is provided, get the public IP
      const ipToUse = newIp || await this.ipResolver.getPublicIP();
      console.log(`Using IP address: ${ipToUse}`);

      // Get the zone ID
      const zoneResponse = await this.makeRequest(
        `/v1beta/dns/zones?name_pattern=${encodeURIComponent(domain)}&with_records=true`
      );

      const zoneInfo = zoneResponse.data.results.find(item => item.name === domain);
      const zoneId = zoneInfo.id;

      // Get existing records
    //   const recordsResponse = await this.makeRequest(
    //     `/v1beta/dns/zones/${zoneId}/records`
    //   );
    //   console.log(`recordsResponse: ${JSON.stringify(recordsResponse)}`);

      const records = zoneInfo.records;

      // Find the A record for the subdomain
      const record = records.find(
        (r) => r.name === `${subdomain}.${domain}` && r.type === 'A'
      );

      // Check if the IP is different from the current one
      if (record && record.value === ipToUse) {
        console.log(`DNS record already up to date with IP: ${ipToUse}`);
        return;
      }

      if (record) {
        console.log(`Updating existing A record for ${subdomain}.${domain}`);

        // Update existing record
        const updateExistingRecordData = {
            id: record?.id,
            name: domain,
            records: {
                update: [
                    {
                        "original_record": {
                            "name": subdomain,
                            "prio": record.prio,
                            "ttl": record?.ttl || 900,
                            "type": "A",
                            "value": record?.value || ipToUse
                        },
                        "record": {
                            name: subdomain,
                            type: 'A',
                            value: ipToUse,
                            ttl: record?.ttl || 900    
                        }
                    }
                ]
            },
          };

        await this.makeRequest(`/v1beta/dns/zones/${domain}`, {
          method: 'PUT',
          body: JSON.stringify(updateExistingRecordData),
        });
      } else {
        console.log(`Adding new A record for ${subdomain}.${domain}`);
        const recordData = {
            id: record?.id,
            name: domain,
            records: {
                add: [
                    {
                        name: subdomain,
                        type: 'A',
                        value: ipToUse,
                        ttl: record?.ttl || 900,        
                    }
                ]
            },
          };

        // Create new record if it doesn't exist
        await this.makeRequest(`/v1beta/dns/zones/${domain}`, {
          method: 'PUT',
          body: JSON.stringify(recordData),
        });
      }

      console.log(`Successfully updated DNS record for ${subdomain}.${domain} to ${ipToUse}`);
    } catch (error) {
      console.error('Failed to update DNS record:', error);
      throw error;
    }
  }
}

// Usage example
async function main() {
  // Load credentials from environment variables
  const auth = {
    username: process.env.OPENPROVIDER_USERNAME,
    password: process.env.OPENPROVIDER_PASSWORD,
  };

  // Validate environment variables
  if (!auth.username || !auth.password) {
    console.error('Missing required environment variables: OPENPROVIDER_USERNAME and/or OPENPROVIDER_PASSWORD');
    process.exit(1);
  }

  const dnsUpdater = new OpenProviderDNSUpdater(auth);

  try {
    // Update with automatic IP detection
    await dnsUpdater.updateDNSRecord(process.env.DOMAIN, process.env.SUBDOMAIN);
  } catch (error) {
    console.error('Error updating DNS:', error);
    process.exit(1);
  }
}

// Run the program
if (import.meta.url === new URL(import.meta.url).href) {
  main();
}

export default OpenProviderDNSUpdater;