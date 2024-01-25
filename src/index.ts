import { createClient } from "@libsql/client";
import bodyParser from "body-parser";
import { and, desc, eq, gt, gte, lt, lte, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import express, { RequestHandler } from "express";
import cron from "node-cron";
import { v4 as uuid } from "uuid";
import * as schema from "./schema";

// Define constants
const SERVICE_KEY = process.env.SERVICE_KEY;
const port = process.env.PORT ?? 3000;

// Ensure SERVICE_KEY is defined
if (!SERVICE_KEY) {
  throw new Error("SERVICE_KEY is not defined");
}

// Initialize DB connection
const client = createClient({ url: process.env.DATABASE_URL! });
const db = drizzle<typeof schema>(client);

// Initialize web server
const app = express();

// Middleware to validate IFTTT requests
const iftttMiddleware: RequestHandler = (req, res, next) => {
  const serviceKey = req.headers["ifttt-service-key"];
  const channelKey = req.headers["ifttt-channel-key"];

  if (serviceKey !== SERVICE_KEY || channelKey !== SERVICE_KEY) {
    return res.status(401).json({ errors: [{ message: "Unauthorized" }] });
  }

  next();
};

// Middleware for JSON parsing
app.use(bodyParser.json());
app.use(iftttMiddleware);

// Generic status endpoint
app.get("/ifttt/v1/status", (req, res) => res.status(200).send("OK"));

// Endpoint to return example data used in the IFTTT UI
app.post("/ifttt/v1/test/setup", (req, res) =>
  res.status(200).json({
    data: {
      samples: {
        triggers: {
          price_drop: {
            price_change_direction: "more_then",
            threshold: "26",
          },
        },
      },
    },
  }),
);

// Endpoint to delete a trigger
app.delete("/ifttt/v1/triggers/price_drop/trigger_identity/:trigger_identity", async (req, res) => {
  const { trigger_identity } = req.params;

  try {
    // Delete the trigger from the database
    await db.delete(schema.triggers).where(eq(schema.triggers.identity, trigger_identity));

    // delete associated events from the database
    await db.delete(schema.events).where(eq(schema.events.identity, trigger_identity));

    console.log("Deleted Trigger with identity:", trigger_identity);

    // Respond with a success status
    return res.status(200).json({ message: "Trigger deleted successfully" });
  } catch (error) {
    console.error("Error deleting trigger:", error);
    return res.status(500).json({ errors: [{ message: "Internal server error" }] });
  }
});


// Actual endpoint for the trigger
app.post("/ifttt/v1/triggers/price_drop", async (req, res) => {
  // Validate base request
  if (
    !req.body ||
    !req.body.trigger_identity ||
    !req.body.triggerFields ||
    !req.body.triggerFields.price_change_direction ||
    !req.body.triggerFields.threshold ||
    !["less_than", "more_than"].includes(
      req.body.triggerFields.price_change_direction,
    ) ||
    Number.isNaN(Number(req.body.triggerFields.threshold))
  ) {
    return res.status(400).json({ errors: [{ message: "Bad request" }] });
  }

  // Recognize limit parameter if set or fallback to default of 50
  const limit = typeof req.body.limit === "undefined" ? 50 : req.body.limit;

  // In test mode, return dummy data
  if (req.headers["ifttt-test-mode"] === "1") {
    const timestamp = new Date().getUTCSeconds();

    // Need to have different IDs and be in reverse order (newest first)
    const events = [
      {
        meta: {
          id: uuid(),
          timestamp: timestamp + 2,
        },
      },
      {
        meta: {
          id: uuid(),
          timestamp: timestamp + 1,
        },
      },
      {
        meta: {
          id: uuid(),
          timestamp,
        },
      },
    ];

    return res.status(200).json({
      data: events.length > limit ? events.slice(0, limit) : events,
    });
  }

  // Check if trigger already exists, if not create it
  const result = await db
    .select()
    .from(schema.triggers)
    .where(eq(schema.triggers.identity, req.body.trigger_identity))
    .limit(1);

  if (!result.length) {
    await db.insert(schema.triggers).values({
      identity: req.body.trigger_identity,
      direction: req.body.triggerFields.price_change_direction,
      threshold: req.body.triggerFields.threshold,
    });
    console.log("New Trigger created with identity:", req.body.trigger_identity);
  }

  // Query and return events
  const events = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.identity, req.body.trigger_identity))
    .orderBy(desc(schema.events.triggeredAt))
    .limit(limit);


  return res.status(200).json({
    data: events.map((event) => ({
      meta: {
        id: event.id,
        timestamp: new Date(event.triggeredAt).getTime(),
      },
    })),
  });
});

// Start web server
app.listen(port, () => console.log(`App running on port ${port}`));

// Cron job running at the beginning of every hour to check the prices
cron.schedule("0 * * * *", async () => {
  console.log("Checking price...");

  // Fetch data from awattar.de
  const {
    data,
  }: {
    data: {
      start_timestamp: number;
      end_timestamp: number;
      marketprice: number;
      unit: "Eur/MWh";
    }[];
  } = await (await fetch("https://api.awattar.de/v1/marketdata")).json();

  if (!data.length) {
    console.log("API returned no data");
    throw process.exit(1);
  }

  // Constants for additional costs (in cent)
  const KWH_PER_YEAR = 3383; // Average for household/year in Germany 2021
  const MEHRWERTSTEUERSATZ = 0.19;
  const STROMSTEUER = 2.05;
  const KONZESSIONSABGABE = 1.99;
  const OFFSHORE_NETZUMLAGE = 0.656;
  const KWKG_UMLAGE = 0.275;
  const STROMNEV_UMLAGE = 0.403;
  const NETZENTGELTE = 5.12

  // Calculate price in ct/kWh including additional costs
  const priceKwhCents =
    ((data[0].marketprice / 10) +
      STROMSTEUER +
      KONZESSIONSABGABE +
      OFFSHORE_NETZUMLAGE +
      KWKG_UMLAGE +
      STROMNEV_UMLAGE +
      NETZENTGELTE) *
    (1 + MEHRWERTSTEUERSATZ);

  // Log the calculated prices
  console.log(`The API returns a price of "${(data[0].marketprice / 10)}"`);
  console.log(`The price including tax is "${priceKwhCents}"`);

  // Get all triggers matching the current price
  const new_triggers = await db
    .select()
    .from(schema.triggers)
    .where(
      or(
        and(
          eq(schema.triggers.direction, "less_than"),
          gte(schema.triggers.threshold, priceKwhCents),
        ),
        and(
          eq(schema.triggers.direction, "more_than"),
          lte(schema.triggers.threshold, priceKwhCents),
        ),
      ),
    );

  for (let trigger of new_triggers) {
    // Create a new event (needs to be stored permanently as the IFTTT API is based on long polling)
    await db.insert(schema.events).values({
      identity: trigger.identity,
    });

    console.log(`New event recorded for identity "${trigger.identity}"`);

    // Notify IFTTT of new events for immediate triggering
    await fetch("https://realtime.ifttt.com/v1/notifications", {
      method: "post",
      headers: {
        "IFTTT-Service-Key": SERVICE_KEY,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: [
          {
            trigger_identity: trigger.identity,
          },
        ],
      }),
    });

    console.log(`Triggered Realtime API for identity "${trigger.identity}"`);
  }
  
console.log("Handled all triggers");
});