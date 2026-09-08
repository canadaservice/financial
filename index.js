"use strict";

const express = require("express");
const cors = require("cors");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const app = express();

const PORT = process.env.PORT || 3000;

const FEEXPAY_API_KEY = process.env.FEEXPAY_API_KEY;
const FEEXPAY_SHOP_ID = process.env.FEEXPAY_SHOP_ID;

const FEEXPAY_BASE =
  "https://api-v2.feexpay.me/api/transactions/public";

const FEEXPAY_STATUS_BASE =
  "https://api-v2.feexpay.me/api/transactions/public/single/status";

const PUBLIC_URL =
  process.env.PUBLIC_URL || `http://localhost:${PORT}`;

const USD_TO_XOF = 550;
const USD_TO_XAF = 550;

const MIN_AMOUNT = 100;
const MAX_AMOUNT = 2000000;

// ----------------------------------------------------
// SERVICES
// ----------------------------------------------------

const SERVICES = {
  biometrie: {
    name: "Biométrie",
    usd: 1
  },

  langue: {
    name: "Test de langue",
    usd: 150
  },

  administratif: {
    name: "Frais administratifs",
    usd: 220
  }
};

// ----------------------------------------------------
// RÉSEAUX FEEXPAY
// ----------------------------------------------------

const NETWORKS = {
  BEN: {
    country: "Bénin",
    currency: "XOF",
    prefix: "229",
    nationalLength: 10,

    operators: {
      mtn: {
        name: "MTN Bénin",
        endpoint: "/requesttopay/mtn",
        requiresOtp: false,
        paymentUrl: false
      },

      moov: {
        name: "Moov Bénin",
        endpoint: "/requesttopay/moov",
        requiresOtp: false,
        paymentUrl: false
      },

      celtiis_bj: {
        name: "Celtiis Bénin",
        endpoint: "/requesttopay/celtiis_bj",
        requiresOtp: false,
        paymentUrl: false
      },

      coris: {
        name: "Coris Bénin",
        endpoint: "/requesttopay/coris",
        requiresOtp: false,
        paymentUrl: false
      }
    }
  },

  TGO: {
    country: "Togo",
    currency: "XOF",
    prefix: "228",
    nationalLength: 8,

    operators: {
      togocom_tg: {
        name: "Togocom",
        endpoint: "/requesttopay/togocom_tg",
        requiresOtp: false,
        paymentUrl: false
      },

      moov_tg: {
        name: "Moov Togo",
        endpoint: "/requesttopay/moov_tg",
        requiresOtp: false,
        paymentUrl: false
      }
    }
  },

  CIV: {
    country: "Côte d'Ivoire",
    currency: "XOF",
    prefix: "225",
    nationalLength: 10,

    operators: {
      mtn_ci: {
        name: "MTN Côte d'Ivoire",
        endpoint: "/requesttopay/mtn_ci",
        requiresOtp: false,
        paymentUrl: false
      },

      moov_ci: {
        name: "Moov Côte d'Ivoire",
        endpoint: "/requesttopay/moov_ci",
        requiresOtp: false,
        paymentUrl: true
      },

      wave_ci: {
        name: "Wave Côte d'Ivoire",
        endpoint: "/requesttopay/wave_ci",
        requiresOtp: false,
        paymentUrl: true
      },

      orange_ci: {
        name: "Orange Money Côte d'Ivoire",
        endpoint: "/requesttopay/orange_ci",
        requiresOtp: false,
        paymentUrl: true
      }
    }
  },

  CG: {
    country: "Congo Brazzaville",
    currency: "XAF",
    prefix: "242",
    nationalLength: 12,

    operators: {
      mtn_cg: {
        name: "MTN Congo",
        endpoint: "/requesttopay/mtn_cg",
        requiresOtp: false,
        paymentUrl: false
      }
    }
  },

  SEN: {
    country: "Sénégal",
    currency: "XOF",
    prefix: "221",
    nationalLength: 9,

    operators: {
      orange_sn: {
        name: "Orange Sénégal",
        endpoint: "/requesttopay/orange_sn",
        requiresOtp: false,
        paymentUrl: true
      },

      wave_sn: {
        name: "Wave Sénégal",
        endpoint: "/requesttopay/wave_sn",
        requiresOtp: false,
        paymentUrl: true
      },

      free_sn: {
        name: "Free Money Sénégal",
        endpoint: "/requesttopay/free_sn",
        requiresOtp: false,
        paymentUrl: false
      }
    }
  },

  BF: {
    country: "Burkina Faso",
    currency: "XOF",
    prefix: "226",
    nationalLength: 8,

    operators: {
      moov_bf: {
        name: "Moov Burkina Faso",
        endpoint: "/requesttopay/moov_bf",
        requiresOtp: false,
        paymentUrl: false
      },

      orange_bf: {
        name: "Orange Burkina Faso",
        endpoint: "/requesttopay/orange_bf",
        requiresOtp: true,
        paymentUrl: false
      },

      wave_bf: {
        name: "Wave Burkina Faso",
        endpoint: "/requesttopay/wave_bf",
        requiresOtp: false,
        paymentUrl: true
      }
    }
  },

  MLI: {
    country: "Mali",
    currency: "XOF",
    prefix: "223",
    nationalLength: 8,

    operators: {
      orange_ml: {
        name: "Orange Mali",
        endpoint: "/requesttopay/orange_ml",
        requiresOtp: false,
        paymentUrl: false
      },

      moov_ml: {
        name: "Moov Mali",
        endpoint: "/requesttopay/moov_ml",
        requiresOtp: false,
        paymentUrl: false
      }
    }
  }
};

// ----------------------------------------------------
// MIDDLEWARE
// ----------------------------------------------------

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ----------------------------------------------------
// SQLITE
// ----------------------------------------------------

const db = new sqlite3.Database(
  process.env.DATABASE_PATH || "./payments.db"
);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      service TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      country TEXT NOT NULL,
      operator TEXT NOT NULL,
      reference TEXT,
      status TEXT,
      message TEXT,
      payment_url TEXT,
      callback_info TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// ----------------------------------------------------
// OUTILS
// ----------------------------------------------------

function normalizeCountry(country) {
  if (!country) return null;

  const value = String(country).trim().toUpperCase();

  const aliases = {
    BJ: "BEN",
    BENIN: "BEN",
    BEN: "BEN",

    TG: "TGO",
    TOGO: "TGO",
    TGO: "TGO",

    CI: "CIV",
    CIV: "CIV",
    COTE_IVOIRE: "CIV",
    COTE_DIVOIRE: "CIV",
    CÔTE_D_IVOIRE: "CIV",

    CG: "CG",
    CONGO: "CG",
    CONGO_BRAZZAVILLE: "CG",

    SN: "SEN",
    SENEGAL: "SEN",
    SÉNÉGAL: "SEN",

    BF: "BF",
    BURKINA: "BF",
    BURKINA_FASO: "BF",

    ML: "MLI",
    MALI: "MLI",
    MLI: "MLI"
  };

  return aliases[value] || null;
}

function normalizeOperator(operator) {
  if (!operator) return null;

  return String(operator)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function cleanDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

/**
 * Normalisation des numéros.
 *
 * IMPORTANT :
 * - Bénin : on conserve le 01.
 * - Sénégal : 9 chiffres nationaux.
 * - Burkina : 8 chiffres nationaux.
 * - Togo : 8 chiffres nationaux.
 * - Mali : 8 chiffres nationaux.
 * - Côte d'Ivoire : 10 chiffres nationaux.
 * - Congo : selon la documentation fournie, 12 chiffres nationaux.
 */
function normalizePhone(phone, countryCode) {
  const config = NETWORKS[countryCode];

  if (!config) {
    throw new Error("Pays non pris en charge.");
  }

  let digits = cleanDigits(phone);

  if (!digits) {
    throw new Error("Numéro de téléphone obligatoire.");
  }

  // Numéro déjà international
  if (digits.startsWith(config.prefix)) {
    const national = digits.slice(config.prefix.length);

    if (national.length !== config.nationalLength) {
      throw new Error(
        `Le numéro ${config.country} doit contenir ${config.nationalLength} chiffres après le préfixe ${config.prefix}.`
      );
    }

    return digits;
  }

  // Numéro local
  //
  // On NE retire PAS automatiquement le 0.
  // C'est indispensable pour le Bénin :
  // 01xxxxxxxx -> 22901xxxxxxxx

  if (digits.length !== config.nationalLength) {
    throw new Error(
      `Le numéro ${config.country} doit contenir ${config.nationalLength} chiffres.`
    );
  }

  // Règle Bénin confirmée par la documentation fournie
  if (countryCode === "BEN" && !digits.startsWith("01")) {
    throw new Error(
      "Au Bénin, le numéro doit être au format 01XXXXXXXX."
    );
  }

  return config.prefix + digits;
}

function getRate(currency) {
  return currency === "XAF" ? USD_TO_XAF : USD_TO_XOF;
}

function calculateAmount(service, currency) {
  const serviceConfig = SERVICES[service];

  if (!serviceConfig) {
    throw new Error("Service invalide.");
  }

  const rate = getRate(currency);

  return Math.round(serviceConfig.usd * rate);
}

function sanitizeDescription(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function generateCallbackInfo() {
  return `order_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 8)}`;
}

function isFinalStatus(status) {
  const value = String(status || "").toUpperCase();

  return [
    "SUCCESS",
    "SUCCESSFUL",
    "FAILED",
    "FAILURE",
    "CANCELLED",
    "CANCELED",
    "REJECTED",
    "ERROR"
  ].includes(value);
}

function isSuccessStatus(status) {
  const value = String(status || "").toUpperCase();

  return [
    "SUCCESS",
    "SUCCESSFUL",
    "ACCEPTED"
  ].includes(value);
}

function extractFeexPayError(data) {
  if (!data) return "Erreur FeexPay inconnue.";

  if (typeof data === "string") {
    return data.slice(0, 500);
  }

  if (data.message) {
    return String(data.message);
  }

  if (data.responsemsg) {
    return String(data.responsemsg);
  }

  if (data.error) {
    return typeof data.error === "string"
      ? data.error
      : JSON.stringify(data.error);
  }

  if (data.response_operator) {
    try {
      return JSON.stringify(data.response_operator);
    } catch {
      return "Erreur retournée par l'opérateur.";
    }
  }

  return "La demande FeexPay n'a pas pu être traitée.";
}

// ----------------------------------------------------
// FEEXPAY REQUEST
// ----------------------------------------------------

async function requestFeexPay(endpoint, payload) {
  const url = FEEXPAY_BASE + endpoint;

  const response = await fetch(url, {
    method: "POST",

    headers: {
      Authorization: `Bearer ${FEEXPAY_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },

    body: JSON.stringify(payload)
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      raw: text
    };
  }

  return {
    httpStatus: response.status,
    ok: response.ok,
    data
  };
}

// ----------------------------------------------------
// HEALTH
// ----------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    service: "FeexPay Payin",
    configured: Boolean(
      FEEXPAY_API_KEY && FEEXPAY_SHOP_ID
    )
  });
});

// ----------------------------------------------------
// SERVICES
// ----------------------------------------------------

app.get("/api/services", (req, res) => {
  res.json({
    success: true,
    services: Object.entries(SERVICES).map(
      ([id, service]) => ({
        id,
        name: service.name,
        usd: service.usd
      })
    )
  });
});

// ----------------------------------------------------
// NETWORKS
// ----------------------------------------------------

app.get("/api/networks", (req, res) => {
  const result = {};

  for (const [countryCode, country] of Object.entries(NETWORKS)) {
    result[countryCode] = {
      country: country.country,
      currency: country.currency,
      prefix: country.prefix,

      operators: Object.entries(country.operators).map(
        ([id, operator]) => ({
          id,
          name: operator.name,
          requiresOtp: operator.requiresOtp,
          paymentUrl: operator.paymentUrl
        })
      )
    };
  }

  res.json({
    success: true,
    networks: result
  });
});

// ----------------------------------------------------
// PAIEMENT
// ----------------------------------------------------

app.post("/api/pay", async (req, res) => {
  try {
    if (!FEEXPAY_API_KEY || !FEEXPAY_SHOP_ID) {
      return res.status(500).json({
        success: false,
        message:
          "Configuration FeexPay manquante sur le serveur."
      });
    }

    const {
      phone,
      service,
      country,
      operator,
      otp
    } = req.body;

    const countryCode = normalizeCountry(country);
    const operatorCode = normalizeOperator(operator);

    if (!countryCode) {
      return res.status(400).json({
        success: false,
        message: "Pays invalide."
      });
    }

    const countryConfig = NETWORKS[countryCode];

    if (!countryConfig) {
      return res.status(400).json({
        success: false,
        message: "Pays non pris en charge."
      });
    }

    const operatorConfig =
      countryConfig.operators[operatorCode];

    if (!operatorConfig) {
      return res.status(400).json({
        success: false,
        message: "Réseau de paiement invalide pour ce pays."
      });
    }

    if (!SERVICES[service]) {
      return res.status(400).json({
        success: false,
        message: "Service invalide."
      });
    }

    // Normalisation numéro
    let cleanedPhone;

    try {
      cleanedPhone = normalizePhone(
        phone,
        countryCode
      );
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    // Montant calculé côté serveur
    const amount = calculateAmount(
      service,
      countryConfig.currency
    );

    if (
      amount < MIN_AMOUNT ||
      amount > MAX_AMOUNT
    ) {
      return res.status(400).json({
        success: false,
        message:
          `Montant hors limites FeexPay (${MIN_AMOUNT} - ${MAX_AMOUNT}).`
      });
    }

    // OTP Orange BF
    if (operatorConfig.requiresOtp) {
      const cleanOtp = String(otp || "")
        .replace(/\D/g, "");

      if (!/^\d{4,8}$/.test(cleanOtp)) {
        return res.status(400).json({
          success: false,
          message:
            "Veuillez saisir le code OTP Orange Burkina reçu après la procédure USSD."
        });
      }
    }

    const callbackInfo = generateCallbackInfo();

    const description = sanitizeDescription(
      `Paiement ${SERVICES[service].name}`
    );

    // Payload de base
    const payload = {
      shop: FEEXPAY_SHOP_ID,
      amount,
      phoneNumber: cleanedPhone,
      callback_info: callbackInfo
    };

    // Description seulement si le réseau la documente
    const descriptionSupported = [
      "mtn",
      "moov",
      "celtiis_bj",
      "mtn_ci",
      "moov_ci",
      "wave_ci",
      "orange_ci",
      "orange_sn",
      "wave_sn",
      "free_sn",
      "mtn_cg"
    ].some(
      key => operatorCode === key
    );

    if (descriptionSupported) {
      payload.description = description;
    }

    // Champs return_url pour les opérateurs avec redirection
    if (operatorConfig.paymentUrl) {
      payload.return_url =
        `${PUBLIC_URL}/?payment_return=1`;
    }

    // Wave CI accepte également cancel_url
    if (operatorCode === "wave_ci") {
      payload.cancel_url =
        `${PUBLIC_URL}/?payment_cancelled=1`;
    }

    // OTP Orange BF
    if (operatorConfig.requiresOtp) {
      payload.otp = String(otp).replace(/\D/g, "");
    }

    console.log(
      `[PAYIN] ${countryCode}/${operatorCode}`,
      {
        phone: cleanedPhone,
        amount,
        currency: countryConfig.currency,
        service,
        callbackInfo
      }
    );

    const result = await requestFeexPay(
      operatorConfig.endpoint,
      payload
    );

    const data = result.data || {};

    const reference =
      data.reference ||
      data.transref ||
      data.order_id ||
      null;

    const status =
      String(data.status || "PENDING").toUpperCase();

    const message =
      data.message ||
      data.responsemsg ||
      data.description ||
      "";

    const paymentUrl =
      data.payment_url ||
      data.paymentUrl ||
      null;

    // Si HTTP FeexPay est en erreur
    if (!result.ok) {
      const errorMessage =
        extractFeexPayError(data);

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
          callback_info
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          cleanedPhone,
          service,
          amount,
          countryConfig.currency,
          countryCode,
          operatorCode,
          reference,
          "FAILED",
          errorMessage,
          paymentUrl,
          callbackInfo
        ]
      );

      return res.status(result.httpStatus || 400).json({
        success: false,
        status: "FAILED",
        message: errorMessage,
        reference,
        amount,
        currency: countryConfig.currency,
        payment_url: paymentUrl
      });
    }

    // Enregistrement
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
        callback_info
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        cleanedPhone,
        service,
        amount,
        countryConfig.currency,
        countryCode,
        operatorCode,
        reference,
        status,
        message,
        paymentUrl,
        callbackInfo
      ]
    );

    return res.json({
      success: true,
      status,
      reference,
      message,
      amount,
      currency: countryConfig.currency,
      country: countryCode,
      operator: operatorCode,
      payment_url: paymentUrl,
      callback_info: callbackInfo,

      // Permet au frontend de savoir s'il doit encore vérifier
      final: isFinalStatus(status),

      // Information pratique
      payment_required:
        Boolean(paymentUrl) &&
        !isSuccessStatus(status)
    });

  } catch (error) {
    console.error("PAYMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      status: "FAILED",
      message:
        error.message ||
        "Erreur interne lors du paiement."
    });
  }
});

// ----------------------------------------------------
// STATUT FEEXPAY
// ----------------------------------------------------

app.get(
  "/api/payment-status/:reference",
  async (req, res) => {
    try {
      if (!FEEXPAY_API_KEY) {
        return res.status(500).json({
          success: false,
          message:
            "Clé API FeexPay absente."
        });
      }

      const reference =
        String(req.params.reference || "").trim();

      if (!reference) {
        return res.status(400).json({
          success: false,
          message: "Référence manquante."
        });
      }

      const url =
        `${FEEXPAY_STATUS_BASE}/${encodeURIComponent(reference)}`;

      const response = await fetch(url, {
        method: "GET",

        headers: {
          Authorization:
            `Bearer ${FEEXPAY_API_KEY}`,
          Accept: "application/json"
        }
      });

      const text = await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        data = {
          raw: text
        };
      }

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          status: "FAILED",
          message:
            extractFeexPayError(data),
          reference
        });
      }

      const status =
        String(
          data.status ||
          data.transaction_status ||
          "PENDING"
        ).toUpperCase();

      const message =
        data.message ||
        data.responsemsg ||
        data.description ||
        "";

      db.run(
        `
        UPDATE payments
        SET status = ?, message = ?
        WHERE reference = ?
        `,
        [
          status,
          message,
          reference
        ]
      );

      return res.json({
        success: true,
        reference,
        status,
        message,
        final: isFinalStatus(status),
        successful: isSuccessStatus(status),
        data
      });

    } catch (error) {
      console.error(
        "STATUS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        status: "ERROR",
        message:
          "Impossible de vérifier le statut."
      });
    }
  }
);

// ----------------------------------------------------
// HISTORIQUE LOCAL D'UNE TRANSACTION
// ----------------------------------------------------

app.get(
  "/api/payment/:reference",
  (req, res) => {
    const reference =
      String(req.params.reference || "").trim();

    db.get(
      `
      SELECT *
      FROM payments
      WHERE reference = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [reference],
      (error, row) => {
        if (error) {
          return res.status(500).json({
            success: false,
            message: "Erreur base de données."
          });
        }

        if (!row) {
          return res.status(404).json({
            success: false,
            message: "Transaction introuvable."
          });
        }

        res.json({
          success: true,
          payment: row
        });
      }
    );
  }
);

// ----------------------------------------------------
// SITE WEB
// ----------------------------------------------------

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

app.get("*", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

// ----------------------------------------------------
// START
// ----------------------------------------------------

app.listen(PORT, () => {
  console.log(
    `Serveur démarré sur le port ${PORT}`
  );

  console.log(
    "FeexPay API configurée :",
    Boolean(
      FEEXPAY_API_KEY &&
      FEEXPAY_SHOP_ID
    )
  );
});
