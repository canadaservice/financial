"use strict";

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// Capture le corps original pour vérifier la signature HMAC SebPay
app.use(cors());
app.use(express.json({
  limit: "1mb",
  verify: (req, res, buf) => {
    req.rawBody = Buffer.from(buf);
  }
}));

// =========================================================
// FEEXPAY
// =========================================================

const FEEXPAY_API_KEY = process.env.FEEXPAY_API_KEY;
const FEEXPAY_SHOP_ID = process.env.FEEXPAY_SHOP_ID;

const FEEXPAY_BASE =
  "https://api-v2.feexpay.me/api/transactions/public";

const FEEXPAY_STATUS =
  `${FEEXPAY_BASE}/single/status`;

// =========================================================
// SEBPAY
// =========================================================

const SEBPAY_PUBLIC_KEY =
  process.env.SEBPAY_PUBLIC_KEY;

const SEBPAY_SECRET_KEY =
  process.env.SEBPAY_SECRET_KEY;

const SEBPAY_BASE =
  process.env.SEBPAY_BASE_URL ||
  "https://newapi.sebpay.bj/api/v1";

const SEBPAY_CALLBACK_URL =
  process.env.SEBPAY_CALLBACK_URL || "";

// =========================================================
// TAUX
// =========================================================

const USD_TO_XOF =
  Number(process.env.USD_TO_XOF || 550);

const USD_TO_XAF =
  Number(process.env.USD_TO_XAF || 550);

const USD_TO_CDF =
  Number(process.env.USD_TO_CDF || 2300);

// =========================================================
// SERVICES
// =========================================================

const SERVICES = {

  biometrie: {
    usd: 85,
    description: "Donnees biometriques"
  },

  langue: {
    usd: 150,
    description: "Test de langue"
  },

  administratif: {
    usd: 220,
    description: "Frais administratifs"
  },

  total: {
    usd: 520,
    description: "Paiement services"
  }

};

// =========================================================
// PAYS ET RESEAUX
// =========================================================

const NETWORKS = {

  BEN: {
    name: "Bénin",
    iso: "BJ",
    prefix: "229",
    currency: "XOF",
    provider: "feexpay",

    networks: {

      mtn: {
        label: "MTN Bénin",
        endpoint:
          `${FEEXPAY_BASE}/requesttopay/mtn`
      },

      moov: {
        label: "Moov Bénin",
        endpoint:
          `${FEEXPAY_BASE}/requesttopay/moov`
      },

      celtiis: {
        label: "Celtiis Bénin",
        endpoint:
          `${FEEXPAY_BASE}/requesttopay/celtiis_bj`
      }

    }
  },

  CIV: {
    name: "Côte d'Ivoire",
    iso: "CI",
    prefix: "225",
    currency: "XOF",
    provider: "feexpay",

    networks: {

      mtn: {
        label: "MTN Côte d'Ivoire",
        endpoint:
          `${FEEXPAY_BASE}/requesttopay/mtn_ci`
      },

      moov: {
        label: "Moov Côte d'Ivoire",
        endpoint:
          `${FEEXPAY_BASE}/requesttopay/moov_ci`
      },

      orange: {
        label: "Orange Côte d'Ivoire",
        endpoint:
          `${FEEXPAY_BASE}/requesttopay/orange_ci`
      },

      wave: {
        label: "Wave Côte d'Ivoire",
        endpoint:
          `${FEEXPAY_BASE}/requesttopay/wave_ci`
      }

    }
  },

  BF: {
    name: "Burkina Faso",
    iso: "BF",
    prefix: "226",
    currency: "XOF",
    provider: "feexpay",

    networks: {

      moov: {
        label: "Moov Burkina Faso",
        endpoint:
          `${FEEXPAY_BASE}/requesttopay/moov_bf`
      },

      orange: {
        label: "Orange Burkina Faso",
        endpoint:
          `${FEEXPAY_BASE}/requesttopay/orange_bf`
      }

    }
  },

  COG: {
    name: "Congo-Brazzaville",
    iso: "CG",
    prefix: "242",
    currency: "XAF",
    provider: "feexpay",

    networks: {

      mtn: {
        label: "MTN Congo",
        endpoint:
          `${FEEXPAY_BASE}/requesttopay/mtn_cg`
      }

    }
  },

  SEN: {
    name: "Sénégal",
    iso: "SN",
    prefix: "221",
    currency: "XOF",
    provider: "feexpay",

    networks: {

      orange: {
        label: "Orange Sénégal",
        endpoint:
          `${FEEXPAY_BASE}/requesttopay/orange_sn`
      },

      wave: {
        label: "Wave Sénégal",
        endpoint:
          `${FEEXPAY_BASE}/requesttopay/wave_sn`
      },

      free: {
        label: "Free Sénégal",
        endpoint:
          `${FEEXPAY_BASE}/requesttopay/free_sn`
      }

    }
  },

  TGO: {
    name: "Togo",
    iso: "TG",
    prefix: "228",
    currency: "XOF",
    provider: "feexpay",

    networks: {

      togocom: {
        label: "Togocom",
        endpoint:
          `${FEEXPAY_BASE}/requesttopay/togocom_tg`
      },

      moov: {
        label: "Moov Togo",
        endpoint:
          `${FEEXPAY_BASE}/requesttopay/moov_tg`
      }

    }
  },

  MLI: {
    name: "Mali",
    iso: "ML",
    prefix: "223",
    currency: "XOF",
    provider: "feexpay",

    networks: {

      orange: {
        label: "Orange Mali",
        endpoint:
          `${FEEXPAY_BASE}/requesttopay/orange_ml`
      },

      moov: {
        label: "Moov Mali",
        endpoint:
          `${FEEXPAY_BASE}/requesttopay/moov_ml`
      }

    }
  },

  // =======================================================
  // CAMEROUN - SEBPAY
  // =======================================================

  CMR: {
    name: "Cameroun",
    iso: "CM",
    prefix: "237",
    currency: "XAF",
    provider: "sebpay",

    networks: {

      mtn: {
        label: "MTN Mobile Money",
        slug: "mtn"
      },

      orange: {
        label: "Orange Money",
        slug: "orange"
      }

    }
  },

  // =======================================================
  // RDC - SEBPAY
  // =======================================================

  COD: {
    name: "R.D. Congo",
    iso: "CD",
    prefix: "243",
    currency: "CDF",
    provider: "sebpay",

    networks: {

      airtel: {
        label: "Airtel Money",
        slug: "airtel"
      },

      orange: {
        label: "Orange Money",
        slug: "orange"
      },

      mpesa: {
        label: "M-Pesa",
        slug: "mpesa"
      },

      vodacom: {
        label: "Vodacom",
        slug: "vodacom"
      }

    }
  }

};

// =========================================================
// NORMALISATION PAYS
// =========================================================

const COUNTRY_ALIASES = {

  BJ: "BEN",
  BENIN: "BEN",
  BEN: "BEN",

  CI: "CIV",
  COTEIVOIRE: "CIV",
  COTEDIVOIRE: "CIV",
  CIV: "CIV",

  BF: "BF",
  BURKINA: "BF",
  BURKINAFASO: "BF",

  CG: "COG",
  CONGO: "COG",
  CONGOBRAZZAVILLE: "COG",
  COG: "COG",

  SN: "SEN",
  SENEGAL: "SEN",
  SEN: "SEN",

  TG: "TGO",
  TOGO: "TGO",
  TGO: "TGO",

  ML: "MLI",
  MALI: "MLI",
  MLI: "MLI",

  CM: "CMR",
  CAMEROUN: "CMR",
  CAMEROON: "CMR",
  CMR: "CMR",

  CD: "COD",
  RDC: "COD",
  RDCONGO: "COD",
  CONGOKINSHASA: "COD",
  REPUBLIQUEDEMOCRATIQUEDUCONGO: "COD",
  DEMOCRATICREPUBLICOFCONGO: "COD",
  COD: "COD"

};

function normalizeCountry(value) {

  if (!value) return null;

  const key =
    String(value)
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "");

  return COUNTRY_ALIASES[key] || key;
}

function normalizeOperator(value) {

  if (!value) return null;

  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

// =========================================================
// OUTILS
// =========================================================

function first(...values) {

  return values.find(
    value =>
      value !== undefined &&
      value !== null &&
      value !== ""
  ) ?? null;

}

function getRate(currency) {

  if (currency === "CDF")
    return USD_TO_CDF;

  if (currency === "XAF")
    return USD_TO_XAF;

  return USD_TO_XOF;

}

function amountFor(service, currency) {

  return Math.round(
    SERVICES[service].usd *
    getRate(currency)
  );

}

function cleanPhone(phone, countryCode) {

  let number =
    String(phone || "")
      .replace(/\D/g, "");

  const country =
    NETWORKS[countryCode];

  if (!country)
    return number;

  const prefix =
    country.prefix;

  if (number.startsWith(prefix))
    return number;

  if (number.startsWith("0"))
    number = number.substring(1);

  return prefix + number;

}

function validPhone(phone, countryCode) {

  const country =
    NETWORKS[countryCode];

  if (!country)
    return false;

  const prefix =
    country.prefix;

  if (!phone.startsWith(prefix))
    return false;

  const national =
    phone.substring(prefix.length);

  return /^\d{8,10}$/.test(national);

}

async function jsonOrText(response) {

  const text =
    await response.text();

  try {

    return JSON.parse(text);

  } catch {

    return {
      message: text
    };

  }

}

// =========================================================
// SQLITE
// =========================================================

const db =
  new sqlite3.Database("./payments.db");

db.serialize(() => {

  db.run(`
    CREATE TABLE IF NOT EXISTS payments (

      id INTEGER PRIMARY KEY AUTOINCREMENT,

      phone TEXT,
      service TEXT,
      amount INTEGER,
      currency TEXT,
      country TEXT,
      operator TEXT,
      reference TEXT,
      status TEXT,
      message TEXT,
      payment_url TEXT,
      provider TEXT,
      provider_reference TEXT,

      created_at
      DATETIME DEFAULT CURRENT_TIMESTAMP

    )
  `);

  const columns = [

    ["reference", "TEXT"],
    ["message", "TEXT"],
    ["payment_url", "TEXT"],
    ["provider", "TEXT"],
    ["provider_reference", "TEXT"]

  ];

  for (const [column, type] of columns) {

    db.run(
      `ALTER TABLE payments ADD COLUMN ${column} ${type}`,
      () => {}
    );

  }

});

function savePayment(payment) {

  return new Promise((resolve, reject) => {

    db.run(

      `
      INSERT INTO payments
      (
        phone,
        service,
        amount,
        currency,
        country,
        operator,
        reference,
        status,
        message,
        payment_url,
        provider,
        provider_reference
      )

      VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,

      [

        payment.phone,
        payment.service,
        payment.amount,
        payment.currency,
        payment.country,
        payment.operator,
        payment.reference,
        payment.status,
        payment.message,
        payment.payment_url,
        payment.provider,
        payment.provider_reference

      ],

      error => {

        if (error)
          reject(error);
        else
          resolve();

      }

    );

  });

}

function findPayment(reference) {

  return new Promise((resolve, reject) => {

    db.get(

      `
      SELECT *
      FROM payments
      WHERE reference = ?
      OR provider_reference = ?

      ORDER BY id DESC
      LIMIT 1
      `,

      [reference, reference],

      (error, row) => {

        if (error)
          reject(error);
        else
          resolve(row);

      }

    );

  });

}

function updatePayment(
  reference,
  status,
  message
) {

  db.run(

    `
    UPDATE payments

    SET
      status = ?,
      message = ?

    WHERE reference = ?
    OR provider_reference = ?
    `,

    [
      status,
      message,
      reference,
      reference
    ]

  );

}

// =========================================================
// SEBPAY OPERATEURS
// =========================================================

const operatorCache = {

  CMR: {
    data: null,
    time: 0
  },

  COD: {
    data: null,
    time: 0
  }

};

function sebHeaders() {

  return {

    "X-Public-Key":
      SEBPAY_PUBLIC_KEY,

    "X-Secret-Key":
      SEBPAY_SECRET_KEY,

    "Content-Type":
      "application/json"

  };

}

async function sebpayOperators(
  isoCountry
) {

  if (
    !SEBPAY_PUBLIC_KEY ||
    !SEBPAY_SECRET_KEY
  ) {

    return null;

  }

  const internal =
    isoCountry === "CM"
      ? "CMR"
      : "COD";

  const cache =
    operatorCache[internal];

  if (
    cache.data &&
    Date.now() - cache.time <
      10 * 60 * 1000
  ) {

    return cache.data;

  }

  try {

    const response =
      await fetch(

        `${SEBPAY_BASE}/operators?country=${encodeURIComponent(isoCountry)}`,

        {
          method: "GET",
          headers: sebHeaders()
        }

      );

    const raw =
      await jsonOrText(response);

    if (!response.ok) {

      console.error(
        "SebPay operators:",
        response.status,
        raw
      );

      return null;

    }

    const list =

      Array.isArray(raw)
        ? raw

        : Array.isArray(raw.data)
          ? raw.data

          : Array.isArray(
              raw.data?.operators
            )
            ? raw.data.operators

            : Array.isArray(
                raw.operators
              )
              ? raw.operators

              : null;

    if (!list || !list.length)
      return null;

    const mapped = {};

    for (const item of list) {

      const slug = first(

        item.slug,
        item.code,
        item.operator,
        item.value,
        item.name

      );

      if (!slug)
        continue;

      const key =
        String(slug)
          .toLowerCase()
          .replace(/[\s-]+/g, "_");

      mapped[key] = {

        label: first(

          item.label,
          item.name,
          item.display_name,
          String(slug)

        ),

        slug:
          String(slug)
            .toLowerCase(),

        otp_required:
          Boolean(item.otp_required),

        ussd_code:
          item.ussd_code || null

      };

    }

    if (
      !Object.keys(mapped).length
    ) {

      return null;

    }

    cache.data =
      mapped;

    cache.time =
      Date.now();

    return mapped;

  } catch (error) {

    console.error(
      "Erreur opérateurs SebPay:",
      error.message
    );

    return null;

  }

}

async function frontendCountry(
  countryCode
) {

  const country =
    NETWORKS[countryCode];

  let networks =
    country.networks;

  if (
    country.provider ===
    "sebpay"
  ) {

    networks =
      await sebpayOperators(
        country.iso
      ) || networks;

  }

  return {

    name:
      country.name,

    iso:
      country.iso,

    prefix:
      country.prefix,

    currency:
      country.currency,

    provider:
      country.provider,

    rate:
      getRate(country.currency),

    networks:

      Object.entries(networks)
        .map(
          ([value, network]) => ({

            value,

            label:
              network.label,

            slug:
              network.slug ||
              value,

            otp_required:
              Boolean(
                network.otp_required
              ),

            ussd_code:
              network.ussd_code ||
              null

          })
        )

  };

}

// =========================================================
// PAIEMENT FEEXPAY
// =========================================================

async function createFeexPay(
  country,
  operator,
  phone,
  amount,
  description
) {

  if (
    !FEEXPAY_API_KEY ||
    !FEEXPAY_SHOP_ID
  ) {

    throw new Error(
      "Configuration FeexPay manquante sur le serveur."
    );

  }

  const network =
    country.networks[operator];

  const response =
    await fetch(

      network.endpoint,

      {
        method: "POST",

        headers: {

          Authorization:
            `Bearer ${FEEXPAY_API_KEY}`,

          "Content-Type":
            "application/json"

        },

        body:
          JSON.stringify({

            shop:
              FEEXPAY_SHOP_ID,

            amount,

            phoneNumber:
              phone,

            description

          })

      }

    );

  const raw =
    await jsonOrText(response);

  console.log(
    "FeexPay:",
    response.status,
    raw
  );

  if (!response.ok) {

    throw new Error(

      first(

        raw?.message,
        raw?.error,
        raw?.reason,

        "FeexPay a refusé le paiement."

      )

    );

  }

  return {

    provider:
      "feexpay",

    status:
      first(
        raw?.status,
        "PENDING"
      ),

    reference:
      first(
        raw?.reference,
        raw?.transaction_id
      ),

    providerReference:
      first(
        raw?.reference,
        raw?.transaction_id
      ),

    message:
      first(
        raw?.message,
        "Transaction initiée."
      ),

    paymentUrl:
      first(
        raw?.payment_url
      ),

    raw

  };

}

// =========================================================
// PAIEMENT SEBPAY
// =========================================================

async function createSebPay(
  countryCode,
  operatorKey,
  phone,
  amount,
  currency
) {

  if (
    !SEBPAY_PUBLIC_KEY ||
    !SEBPAY_SECRET_KEY
  ) {

    throw new Error(
      "Ajoutez SEBPAY_PUBLIC_KEY et SEBPAY_SECRET_KEY dans Render."
    );

  }

  const country =
    NETWORKS[countryCode];

  const dynamic =
    await sebpayOperators(
      country.iso
    );

  const operator =
    dynamic?.[operatorKey] ||
    country.networks[operatorKey];

  if (!operator) {

    throw new Error(
      "Réseau SebPay non disponible pour ce pays."
    );

  }

  const externalReference =
    `PAY-${Date.now()}-${crypto
      .randomBytes(4)
      .toString("hex")}`;

  const body = {

    amount,

    currency,

    phone,

    operator:
      operator.slug ||
      operatorKey,

    country:
      country.iso,

    external_reference:
      externalReference

  };

  if (SEBPAY_CALLBACK_URL) {

    body.callback_url =
      SEBPAY_CALLBACK_URL;

  }

  const response =
    await fetch(

      `${SEBPAY_BASE}/collections`,

      {

        method: "POST",

        headers:
          sebHeaders(),

        body:
          JSON.stringify(body)

      }

    );

  const raw =
    await jsonOrText(response);

  console.log(
    "SebPay:",
    response.status,
    raw
  );

  if (
    !response.ok ||
    raw?.success === false
  ) {

    throw new Error(

      first(

        raw?.message,
        raw?.error,
        raw?.data?.message,

        "SebPay a refusé le paiement."

      )

    );

  }

  const data =
    raw?.data || raw;

  return {

    provider:
      "sebpay",

    status:
      String(
        first(
          data?.status,
          raw?.status,
          "pending"
        )
      ).toLowerCase(),

    reference:
      first(

        data?.external_reference,
        raw?.external_reference,
        externalReference

      ),

    providerReference:
      first(

        data?.transaction_id,
        raw?.transaction_id,
        externalReference

      ),

    message:
      first(

        data?.message,
        raw?.message,

        "Demande SebPay envoyée."

      ),

    paymentUrl:
      first(

        data?.provider_link,
        data?.payment_url,
        raw?.provider_link,
        raw?.payment_url

      ),

    raw

  };

}

// =========================================================
// HEALTH
// =========================================================

app.get(
  "/api/health",
  (req, res) => {

    res.json({

      status:
        "online",

      service:
        "payment-api",

      feexpay:
        Boolean(
          FEEXPAY_API_KEY &&
          FEEXPAY_SHOP_ID
        ),

      sebpay:
        Boolean(
          SEBPAY_PUBLIC_KEY &&
          SEBPAY_SECRET_KEY
        ),

      sebpay_callback:
        Boolean(
          SEBPAY_CALLBACK_URL
        )

    });

  }
);

// =========================================================
// RESEAUX
// =========================================================

app.get(
  "/api/networks",
  async (req, res) => {

    try {

      const result = {};

      for (
        const countryCode
        of Object.keys(NETWORKS)
      ) {

        result[countryCode] =
          await frontendCountry(
            countryCode
          );

      }

      res.json(result);

    } catch (error) {

      console.error(
        "Erreur /api/networks:",
        error
      );

      res.status(500).json({

        success:
          false,

        error:
          "Impossible de charger les réseaux."

      });

    }

  }
);

// =========================================================
// CREATION PAIEMENT
// =========================================================

app.post(
  "/api/pay",
  async (req, res) => {

    try {

      const service =
        req.body?.service;

      const countryCode =
        normalizeCountry(
          req.body?.country
        );

      const operator =
        normalizeOperator(
          req.body?.operator
        );

      const country =
        NETWORKS[countryCode];

      if (!country) {

        return res.status(400).json({

          success:
            false,

          error:
            "Pays non pris en charge."

        });

      }

      if (!SERVICES[service]) {

        return res.status(400).json({

          success:
            false,

          error:
            "Service de paiement invalide."

        });

      }

      if (!operator) {

        return res.status(400).json({

          success:
            false,

          error:
            "Réseau Mobile Money manquant."

        });

      }

      let operatorConfig =
        country.networks[operator];

      if (
        country.provider ===
        "sebpay"
      ) {

        const dynamic =
          await sebpayOperators(
            country.iso
          );

        if (
          dynamic?.[operator]
        ) {

          operatorConfig =
            dynamic[operator];

        }

      }

      if (!operatorConfig) {

        return res.status(400).json({

          success:
            false,

          error:
            "Réseau non pris en charge pour ce pays."

        });

      }

      const phone =
        cleanPhone(
          req.body?.phone,
          countryCode
        );

      if (
        !validPhone(
          phone,
          countryCode
        )
      ) {

        return res.status(400).json({

          success:
            false,

          error:
            `Numéro de téléphone invalide pour ${country.name}.`

        });

      }

      const amount =
        amountFor(
          service,
          country.currency
        );

      if (
        !Number.isFinite(amount) ||
        amount < 100
      ) {

        return res.status(400).json({

          success:
            false,

          error:
            "Montant de paiement invalide."

        });

      }

      if (
        country.provider ===
          "feexpay" &&
        amount > 2000000
      ) {

        return res.status(400).json({

          success:
            false,

          error:
            "Le montant FeexPay doit être compris entre 100 et 2 000 000."

        });

      }

      const description =
        SERVICES[service]
          .description;

      console.log(
        "========== NOUVELLE DEMANDE =========="
      );

      console.log(
        "Fournisseur:",
        country.provider
      );

      console.log(
        "Pays:",
        countryCode
      );

      console.log(
        "Réseau:",
        operator
      );

      console.log(
        "Montant:",
        amount,
        country.currency
      );

      let payment;

      if (
        country.provider ===
        "sebpay"
      ) {

        payment =
          await createSebPay(

            countryCode,
            operator,
            phone,
            amount,
            country.currency

          );

      } else {

        payment =
          await createFeexPay(

            country,
            operator,
            phone,
            amount,
            description

          );

      }

      await savePayment({

        phone,

        service,

        amount,

        currency:
          country.currency,

        country:
          countryCode,

        operator,

        reference:
          payment.reference,

        status:
          payment.status,

        message:
          payment.message,

        payment_url:
          payment.paymentUrl,

        provider:
          payment.provider,

        provider_reference:
          payment.providerReference

      });

      return res.json({

        success:
          true,

        provider:
          payment.provider,

        status:
          payment.status,

        reference:
          payment.reference,

        provider_reference:
          payment.providerReference,

        message:
          payment.message,

        amount,

        currency:
          country.currency,

        country:
          countryCode,

        operator,

        payment_url:
          payment.paymentUrl,

        data:
          payment.raw

      });

    } catch (error) {

      console.error(
        "ERREUR /api/pay:",
        error
      );

      return res.status(500).json({

        success:
          false,

        error:
          error.message ||
          "Erreur interne de paiement."

      });

    }

  }
);

// =========================================================
// STATUT FEEXPAY
// =========================================================

async function feexStatus(
  reference
) {

  if (!FEEXPAY_API_KEY) {

    throw new Error(
      "FEEXPAY_API_KEY manquante."
    );

  }

  const response =
    await fetch(

      `${FEEXPAY_STATUS}/${encodeURIComponent(reference)}`,

      {

        method:
          "GET",

        headers: {

          Authorization:
            `Bearer ${FEEXPAY_API_KEY}`,

          "Content-Type":
            "application/json"

        }

      }

    );

  const data =
    await jsonOrText(
      response
    );

  if (!response.ok) {

    throw new Error(

      first(

        data?.message,
        data?.error,

        "Impossible de vérifier le statut FeexPay."

      )

    );

  }

  return {

    status:
      first(
        data?.status,
        "PENDING"
      ),

    message:
      first(
        data?.message,
        data?.reason,
        ""
      ),

    data

  };

}

// =========================================================
// STATUT SEBPAY
// =========================================================

async function sebStatus(
  reference
) {

  if (
    !SEBPAY_PUBLIC_KEY ||
    !SEBPAY_SECRET_KEY
  ) {

    throw new Error(
      "Clés SebPay manquantes."
    );

  }

  const response =
    await fetch(

      `${SEBPAY_BASE}/collections/${encodeURIComponent(reference)}`,

      {

        method:
          "GET",

        headers:
          sebHeaders()

      }

    );

  const raw =
    await jsonOrText(
      response
    );

  const data =
    raw?.data || raw;

  if (
    !response.ok ||
    raw?.success === false
  ) {

    throw new Error(

      first(

        raw?.message,
        data?.message,
        raw?.error,

        "Impossible de vérifier le statut SebPay."

      )

    );

  }

  return {

    status:
      first(
        data?.status,
        "pending"
      ),

    message:
      first(
        data?.message,
        raw?.message,
        ""
      ),

    data

  };

}

// =========================================================
// STATUT UNIFIE
// =========================================================

app.get(
  "/api/payment-status/:reference",
  async (req, res) => {

    try {

      const reference =
        String(
          req.params.reference ||
          ""
        ).trim();

      if (!reference) {

        return res.status(400).json({

          success:
            false,

          error:
            "Référence manquante."

        });

      }

      const row =
        await findPayment(
          reference
        );

      const provider =
        row?.provider ||
        "feexpay";

      const result =
        provider === "sebpay"

          ? await sebStatus(
              reference
            )

          : await feexStatus(
              reference
            );

      updatePayment(

        reference,

        result.status,

        result.message

      );

      return res.json({

        success:
          true,

        provider,

        reference,

        status:
          result.status,

        message:
          result.message,

        data:
          result.data

      });

    } catch (error) {

      console.error(
        "ERREUR STATUT:",
        error
      );

      return res.status(502).json({

        success:
          false,

        error:
          error.message ||
          "Erreur lors de la vérification du statut."

      });

    }

  }
);

// =========================================================
// WEBHOOK SEBPAY
// =========================================================

app.post(
  "/webhook/sebpay",
  (req, res) => {

    try {

      const signature =
        req.headers[
          "x-sebpay-signature"
        ];

      if (
        SEBPAY_SECRET_KEY &&
        signature
      ) {

        const expected =
          crypto
            .createHmac(
              "sha256",
              SEBPAY_SECRET_KEY
            )
            .update(
              req.rawBody ||
              Buffer.from(
                JSON.stringify(
                  req.body || {}
                )
              )
            )
            .digest("hex");

        const a =
          Buffer.from(
            expected,
            "utf8"
          );

        const b =
          Buffer.from(
            String(signature),
            "utf8"
          );

        if (
          a.length !== b.length ||
          !crypto.timingSafeEqual(
            a,
            b
          )
        ) {

          console.error(
            "Signature SebPay invalide."
          );

          return res.status(401).json({

            success:
              false,

            error:
              "Signature invalide."

          });

        }

      }

      const body =
        req.body || {};

      const reference =
        first(

          body.external_reference,
          body.transaction_id,
          body.reference

        );

      const status =
        first(
          body.status,
          "pending"
        );

      const message =
        first(

          body.message,

          "Mise à jour SebPay reçue."

        );

      if (reference) {

        updatePayment(

          reference,

          status,

          message

        );

      }

      return res.json({

        success:
          true

      });

    } catch (error) {

      console.error(
        "ERREUR WEBHOOK:",
        error
      );

      return res.status(500).json({

        success:
          false

      });

    }

  }
);

// =========================================================
// SITE
// =========================================================

app.use(
  express.static(__dirname)
);

app.get(
  "*",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );

  }
);

// =========================================================
// DEMARRAGE
// =========================================================

app.listen(
  PORT,
  () => {

    console.log(
      "======================================"
    );

    console.log(
      "SERVEUR DE PAIEMENT DEMARRE"
    );

    console.log(
      "PORT:",
      PORT
    );

    console.log(
      "FeexPay:",
      Boolean(
        FEEXPAY_API_KEY &&
        FEEXPAY_SHOP_ID
      )
    );

    console.log(
      "SebPay:",
      Boolean(
        SEBPAY_PUBLIC_KEY &&
        SEBPAY_SECRET_KEY
      )
    );

    console.log(
      "XOF:",
      USD_TO_XOF
    );

    console.log(
      "XAF:",
      USD_TO_XAF
    );

    console.log(
      "CDF:",
      USD_TO_CDF
    );

    console.log(
      "======================================"
    );

  }
);
