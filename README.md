# Price Monitoring API

This Price Monitoring API is the outcome of a bachelor thesis and is designed to work with the IFTTT (If This Then That) service, allowing users to create custom triggers that respond to price fluctuations.

## Author

- [David Albers](https://github.com/324david)


## Installation

1. Ensure you have Node.js and npm installed on your system.

2. Clone the repository to your local computer:

   ```bash
   git clone https://github.com/324david/EnergyTracker.git
   cd repo
   ```

3. Install the dependencies:

   ```bash
   npm install
   ```

4. Set environment variables in a `.env` file or through other appropriate means:

   - `SERVICE_KEY`: The key for accessing the API.
   - `DATABASE_URL`: The URL for the database connection.

5. Start the web server:

   ```bash
   npm start
   ```

## Usage

The API provides the following endpoints:

- `GET /ifttt/v1/status`: A generic status endpoint that returns "OK" to confirm the availability of the API.

- `POST /ifttt/v1/test/setup`: An endpoint for setting up example data for the IFTTT interface. Returns example data for triggers.

- `POST /ifttt/v1/triggers/price_drop`: This endpoint is called to trigger events. Users can create custom triggers to respond to price changes based on thresholds and directions.

- `DELETE /ifttt/v1/triggers/price_drop/trigger_identity/:trigger_identity`: This endpoint allows IFTTT to delete a trigger.

## Authentication

The API uses the `SERVICE_KEY` for authentication. Ensure that you include this key in your enviroment.

## Example Requests

You can test the API using the provided example requests and responses to verify functionality.

## Automated Price Monitoring

The API includes a cron job that monitors energy prices from the [awattar.de API](https://api.awattar.de/v1/marketdata) on an hourly basis, creates triggers when prices reach user-defined thresholds and notifies IFTTT for each Trigger.

## License

This project is licensed under the [MIT License](LICENSE). You are free to use, modify, and distribute it.
