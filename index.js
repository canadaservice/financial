const express = require("express");
const fetch = require("node-fetch");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const FEEXPAY_API_KEY = process.env.FEEXPAY_API_KEY;
const FEEXPAY_SHOP_ID = process.env.FEEXPAY_SHOP_ID;

const FEEXPAY_BASE =
  "https://api-v2.feexpay.me/api/transactions/public";

const STATUS_BASE =
  "https://api-v2.feexpay.me/api/transactions/public/single/status";

/* =========================================================
   CONFIGURATION
========================================================= */

if (!FEEXPAY_API_KEY) {
  console.error("ERREUR : FEEXPAY_API_KEY manquante.");
} else {
  console.log("FeexPay : API KEY OK");
}

if (!FEEXPAY_SHOP_ID) {
  console.error("ERREUR : FEEXPAY_SHOP_ID manquant.");
} else {
  console.log("Shop ID : SHOP ID OK");
}

const USD_TO_XOF = 550;
const USD_TO_XAF = 550;

/* =========================================================
   SERVICES
========================================================= */

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

/* =========================================================
   RESEAUX FEEXPAY
=========================================================

   Chaque réseau possède son propre endpoint.

   Sénégal :
   - Orange Sénégal
   - Wave Sénégal
   - Free Sénégal
========================================================= */

const NETWORKS = {

  BEN: {
    name: "Bénin",
    prefix: "2290",
    currency: "XOF",

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
    prefix: "225",
    currency: "XOF",

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
    prefix: "226",
    currency: "XOF",

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
    prefix: "242",
    currency: "XAF",

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
    prefix: "221",
    currency: "XOF",

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
    prefix: "228",
    currency: "XOF",

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
    prefix: "223",
    currency: "XOF",

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
  }
};

/* =========================================================
   BASE DE DONNEES
========================================================= */

const db = new sqlite3.Database("./payments.db");

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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  /*
   * Compatibilité avec l'ancienne base.
   */
  db.run(
    `ALTER TABLE payments ADD COLUMN reference TEXT`,
    () => {}
  );

  db.run(
    `ALTER TABLE payments ADD COLUMN message TEXT`,
    () => {}
  );

  db.run(
    `ALTER TABLE payments ADD COLUMN payment_url TEXT`,
    () => {}
  );
});

/* =========================================================
   NORMALISATION PAYS
========================================================= */

function normalizeCountry(country) {

  if (!country) {
    return null;
  }

  const value =
    String(country)
      .trim()
      .toUpperCase();

  const aliases = {

    BJ: "BEN",
    BENIN: "BEN",
    BEN: "BEN",

    CI: "CIV",
    COTEIVOIRE: "CIV",
    COTE_DIVOIRE: "CIV",
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
    MLI: "MLI"
  };

  return aliases[value] || value;
}

/* =========================================================
   NORMALISATION OPERATEUR
========================================================= */

function normalizeOperator(operator) {

  if (!operator) {
    return null;
  }

  return String(operator)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/* =========================================================
   NETTOYAGE TELEPHONE
========================================================= */

function cleanPhone(phone, countryCode) {

  if (!phone) {
    return "";
  }

  let value =
    String(phone)
      .replace(/\D/g, "");

  const country =
    NETWORKS[countryCode];

  if (!country) {
    return value;
  }

  const prefix =
    country.prefix;

  /*
   * Le numéro contient déjà l'indicatif.
   */
  if (value.startsWith(prefix)) {
    return value;
  }

  /*
   * L'utilisateur a mis +221...
   * Les caractères + et espaces ont déjà été supprimés.
   */

  return prefix + value;
}

/* =========================================================
   VALIDATION TELEPHONE
========================================================= */

function validatePhone(phone, countryCode) {

  const country =
    NETWORKS[countryCode];

  if (!country) {
    return false;
  }

  /*
   * Indicatif + numéro national.
   *
   * On reste volontairement souple car les longueurs
   * peuvent varier selon les opérateurs.
   */

  const prefix =
    country.prefix;

  if (!phone.startsWith(prefix)) {
    return false;
  }

  const national =
    phone.substring(prefix.length);

  if (!/^\d+$/.test(national)) {
    return false;
  }

  return (
    national.length >= 8 &&
    national.length <= 10
  );
}

/* =========================================================
   DEVISE
========================================================= */

function getRate(currency) {

  if (currency === "XAF") {
    return USD_TO_XAF;
  }

  return USD_TO_XOF;
}

/* =========================================================
   DESCRIPTION
========================================================= */

function getDescription(service) {

  if (
    SERVICES[service] &&
    SERVICES[service].description
  ) {
    return SERVICES[service].description;
  }

  return "Paiement";
}

/* =========================================================
   API HEALTH
========================================================= */

app.get("/api/health", (req, res) => {

  res.json({
    status: "online",
    service: "payment-api",
    feexpay:
      Boolean(
        FEEXPAY_API_KEY &&
        FEEXPAY_SHOP_ID
      )
  });
});

/* =========================================================
   INFORMATIONS PAYS
========================================================= */

app.get("/api/networks", (req, res) => {

  const result = {};

  Object.keys(NETWORKS).forEach(
    countryCode => {

      const country =
        NETWORKS[countryCode];

      result[countryCode] = {
        name: country.name,
        prefix: country.prefix,
        currency: country.currency,
        networks:
          Object.keys(country.networks)
            .map(key => ({
              value: key,
              label:
                country.networks[key].label
            }))
      };
    }
  );

  res.json(result);
});

/* =========================================================
   DEMANDE DE PAIEMENT
========================================================= */

app.post("/api/pay", async (req, res) => {

  try {

    if (
      !FEEXPAY_API_KEY ||
      !FEEXPAY_SHOP_ID
    ) {

      return res.status(500).json({
        success: false,
        error:
          "Configuration FeexPay manquante sur le serveur."
      });
    }

    const {
      phone,
      service,
      country,
      operator
    } = req.body;

    const normalizedCountry =
      normalizeCountry(country);

    const normalizedOperator =
      normalizeOperator(operator);

    /* ---------------------------------------------
       Vérification pays
    --------------------------------------------- */

    const countryConfig =
      NETWORKS[normalizedCountry];

    if (!countryConfig) {

      return res.status(400).json({
        success: false,
        error:
          "Pays non pris en charge."
      });
    }

    /* ---------------------------------------------
       Vérification réseau
    --------------------------------------------- */

    const networkConfig =
      countryConfig.networks[
        normalizedOperator
      ];

    if (!networkConfig) {

      return res.status(400).json({
        success: false,
        error:
          "Réseau non pris en charge pour ce pays."
      });
    }

    /* ---------------------------------------------
       Vérification service
    --------------------------------------------- */

    if (!SERVICES[service]) {

      return res.status(400).json({
        success: false,
        error:
          "Service de paiement invalide."
      });
    }

    /* ---------------------------------------------
       Téléphone
    --------------------------------------------- */

    const cleanedPhone =
      cleanPhone(
        phone,
        normalizedCountry
      );

    if (
      !validatePhone(
        cleanedPhone,
        normalizedCountry
      )
    ) {

      return res.status(400).json({
        success: false,
        error:
          `Numéro de téléphone invalide pour ${countryConfig.name}.`
      });
    }

    /* ---------------------------------------------
       Montant
    --------------------------------------------- */

    const usd =
      SERVICES[service].usd;

    const currency =
      countryConfig.currency;

    const rate =
      getRate(currency);

    const amount =
      Math.round(
        usd * rate
      );

    if (
      amount < 100 ||
      amount > 2000000
    ) {

      return res.status(400).json({
        success: false,
        error:
          "Le montant doit être compris entre 100 et 2 000 000."
      });
    }

    const description =
      getDescription(service);

    console.log("");
    console.log(
      "========== NOUVELLE DEMANDE =========="
    );
    console.log(
      "Téléphone :",
      cleanedPhone
    );
    console.log(
      "Pays :",
      normalizedCountry
    );
    console.log(
      "Réseau :",
      normalizedOperator
    );
    console.log(
      "Service :",
      service
    );
    console.log(
      "Prix USD :",
      usd
    );
    console.log(
      "Taux :",
      rate
    );
    console.log(
      "Montant :",
      amount,
      currency
    );
    console.log(
      "URL :",
      networkConfig.endpoint
    );
    console.log(
      "======================================"
    );

    /* ---------------------------------------------
       APPEL FEEXPAY
    --------------------------------------------- */

    const paymentRes =
      await fetch(
        networkConfig.endpoint,
        {
          method: "POST",

          headers: {
            "Authorization":
              `Bearer ${FEEXPAY_API_KEY}`,

            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            shop:
              FEEXPAY_SHOP_ID,

            amount:
              amount,

            phoneNumber:
              cleanedPhone,

            description:
              description
          })
        }
      );

    const responseText =
      await paymentRes.text();

    let data;

    try {

      data =
        JSON.parse(
          responseText
        );

    } catch {

      data = {
        message:
          responseText
      };
    }

    console.log("");
    console.log(
      "========== REPONSE FEEXPAY =========="
    );
    console.log(data);
    console.log(
      "HTTP :",
      paymentRes.status
    );
    console.log(
      "====================================="
    );

    /* ---------------------------------------------
       ERREUR FEEXPAY
    --------------------------------------------- */

    if (!paymentRes.ok) {

      const errorMessage =
        data.message ||
        data.error ||
        data.reason ||
        "FeexPay a refusé la demande de paiement.";

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
          payment_url
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          cleanedPhone,
          service,
          amount,
          currency,
          normalizedCountry,
          normalizedOperator,
          data.reference || null,
          data.status || "FAILED",
          errorMessage,
          data.payment_url || null
        ]
      );

      return res.status(
        paymentRes.status
      ).json({

        success: false,

        error:
          errorMessage,

        status:
          data.status || "FAILED",

        reference:
          data.reference || null,

        payment_url:
          data.payment_url || null
      });
    }

    /* ---------------------------------------------
       ACCEPTATION
    --------------------------------------------- */

    const status =
      data.status ||
      "PENDING";

    const reference =
      data.reference ||
      null;

    const message =
      data.message ||
      "Transaction initiée.";

    const paymentUrl =
      data.payment_url ||
      null;

    /* ---------------------------------------------
       ENREGISTREMENT
    --------------------------------------------- */

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
        payment_url
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        cleanedPhone,
        service,
        amount,
        currency,
        normalizedCountry,
        normalizedOperator,
        reference,
        status,
        message,
        paymentUrl
      ],
      err => {

        if (err) {
          console.error(
            "Erreur SQLite :",
            err.message
          );
        }
      }
    );

    /* ---------------------------------------------
       REPONSE AU NAVIGATEUR
    --------------------------------------------- */

    return res.json({

      success: true,

      status:
        status,

      reference:
        reference,

      message:
        message,

      amount:
        amount,

      currency:
        currency,

      country:
        normalizedCountry,

      operator:
        normalizedOperator,

      payment_url:
        paymentUrl
    });

  } catch (error) {

    console.error(
      "ERREUR /api/pay :",
      error
    );

    return res.status(500).json({

      success: false,

      error:
        "Erreur interne lors du traitement du paiement."
    });
  }
});

/* =========================================================
   VERIFICATION DU STATUT
========================================================= */

app.get(
  "/api/payment-status/:reference",
  async (req, res) => {

    try {

      const reference =
        String(
          req.params.reference || ""
        ).trim();

      if (!reference) {

        return res.status(400).json({
          success: false,
          error:
            "Référence manquante."
        });
      }

      const url =
        `${STATUS_BASE}/${encodeURIComponent(reference)}`;

      console.log(
        "Vérification statut :",
        reference
      );

      const statusRes =
        await fetch(
          url,
          {
            method: "GET",

            headers: {
              "Authorization":
                `Bearer ${FEEXPAY_API_KEY}`,

              "Content-Type":
                "application/json"
            }
          }
        );

      const responseText =
        await statusRes.text();

      let data;

      try {

        data =
          JSON.parse(
            responseText
          );

      } catch {

        data = {
          message:
            responseText
        };
      }

      console.log(
        "Statut FeexPay :",
        data
      );

      if (!statusRes.ok) {

        return res.status(
          statusRes.status
        ).json({

          success: false,

          error:
            data.message ||
            data.error ||
            "Impossible de vérifier le statut.",

          status:
            data.status ||
            "UNKNOWN",

          reference:
            reference
        });
      }

      const status =
        data.status ||
        "PENDING";

      const message =
        data.message ||
        data.reason ||
        "";

      /* ---------------------------------------------
         Mise à jour SQLite
      --------------------------------------------- */

      db.run(
        `
        UPDATE payments
        SET status = ?,
            message = ?
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

        reference:
          reference,

        status:
          status,

        message:
          message,

        data:
          data
      });

    } catch (error) {

      console.error(
        "ERREUR STATUT :",
        error
      );

      return res.status(500).json({

        success: false,

        error:
          "Erreur lors de la vérification du statut."
      });
    }
  }
);

/* =========================================================
   SERVIR LE SITE
========================================================= */

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

/* =========================================================
   DEMARRAGE
========================================================= */

app.listen(
  PORT,
  () => {

    console.log("");
    console.log(
      "======================================"
    );

    console.log(
      "SERVEUR DE PAIEMENT DEMARRE"
    );

    console.log(
      "PORT :",
      PORT
    );

    console.log(
      "Taux XOF :",
      USD_TO_XOF
    );

    console.log(
      "Taux XAF :",
      USD_TO_XAF
    );

    console.log(
      "======================================"
    );
  }
);
