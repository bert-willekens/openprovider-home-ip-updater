# Update Home IP

This project updates the DNS record for a specified domain and subdomain with the current public IP address using the OpenProvider API.

## Prerequisites

- Node.js (version 12 or higher)
- An OpenProvider account

## Installation

1. Clone the repository:

    ```sh
    git clone https://github.com/yourusername/update-home-ip.git
    cd update-home-ip
    ```

2. Install dependencies:

    ```sh
    pnpm install
    ```

3. Create a `.env` file in the root directory and add your OpenProvider credentials and domain information. You can use the `.env.example` file as a template:

    ```sh
    cp .env.example .env
    ```

    Fill in the required environment variables in the `.env` file:

    ```dotenv
    OPENPROVIDER_USERNAME=your_openprovider_username
    OPENPROVIDER_PASSWORD=your_openprovider_password
    DOMAIN=your_domain
    SUBDOMAIN=your_subdomain
    ```

## Usage

To update the DNS record with the current public IP address, run the following command:

```sh
node update-home-ip.mjs
```

## How It Works

1. The script loads environment variables from the .env file using the dotenv package.
2. It creates an instance of the `OpenProviderDNSUpdater`-class, which handles authentication and DNS record updates.
3. The `updateDNSRecord`-method is called to update the DNS record for the specified domain and subdomain with the current public IP address.

## Classes

### PublicIPResolver

- `getPublicIP()`: Fetches the public IP address using various IP services.
- `isValidIPv4(ip)`: Validates the IPv4 address format.

### OpenProviderDNSUpdater

- `constructor(auth)`: Initializes the updater with authentication credentials.
- `authenticate()`: Authenticates with the OpenProvider API.
- `makeRequest(endpoint, options)`: Makes an API request to OpenProvider.
- `updateDNSRecord(domain, subdomain, newIp)`: Updates the DNS record for the specified domain and subdomain.

## License

This project is licensed under the MIT License.
