const express = require("express");
const fetch = require("node-fetch");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

/* =====================================================
   FICHIERS DU SITE
   ===================================================== */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/logo.png", (req, res) => {
  res.sendFile(path.join(__dirname, "logo.png"));
});

app.get("/background.jpg", (req, res) => {
  res.sendFile(path.join(__dirname, "background.jpg"));
});


/* =====================================================
   BASE DE DONNÉES
   ===================================================== */

const db = new sqlite3.Database("./payments.db");

db.run(`
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT,
    service TEXT,
    amount INTEGER,
    currency TEXT,
    country TEXT,
    operator TEXT,
    status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);


/* =====================================================
   SERVICES
   ===================================================== */

const services = {
  biometrie: 150,
  langue: 150,
  administratif: 220,
  total: 520
};


/* =====================================================
   DEVISES
   ===================================================== */

const currencies = {
  BEN: "XOF",
  CIV: "XOF",
  SEN: "XOF",
  TGO: "XOF",
  CMR: "XAF",
  GAB: "XAF",
  COG: "XAF",
  COD: "CDF"
};


/* =====================================================
   TAUX DE SECOURS
   ===================================================== */

let rates = {
  XOF: 550,
  XAF: 550,
  CDF: 2800
};


/* =====================================================
   CHARGEMENT DES TAUX
   ===================================================== */

async function loadRates() {

  try {

    const response = await fetch(
      "https://open.er-api.com/v6/latest/USD"
    );

    if (!response.ok) {
      throw new Error("Erreur récupération taux");
    }

    const data = await response.json();

    if (data && data.rates) {

      rates = {
        ...rates,
        ...data.rates
      };

    }

    console.log("Taux de change chargés.");

  } catch (error) {

    console.error(
      "Erreur taux de change:",
      error.message
    );

    console.log(
      "Utilisation des taux de secours."
    );
  }
}

loadRates();


/* =====================================================
   NORMALISATION DES PAYS
   ===================================================== */

function normalizeCountry(country) {

  const aliases = {

    BJ: "BEN",
    BEN: "BEN",

    CI: "CIV",
    CIV: "CIV",

    SN: "SEN",
    SEN: "SEN",

    TG: "TGO",
    TGO: "TGO",

    CM: "CMR",
    CMR: "CMR",

    GA: "GAB",
    GAB: "GAB",

    CG: "COG",
    COG: "COG",

    CD: "COD",
    COD: "COD"

  };

  return aliases[country] || country;
}


/* =====================================================
   NORMALISATION OPÉRATEUR
   ===================================================== */

function normalizeOperator(operator) {

  if (!operator) {
    return "";
  }

  return operator
    .toString()
    .trim()
    .toLowerCase();
}


/* =====================================================
   API PAIEMENT
   ===================================================== */

app.post("/api/pay", async (req, res) => {

  const {
    phone,
    service,
    country,
    operator,
    currency
  } = req.body;


  console.log("");
  console.log("========== NOUVELLE DEMANDE ==========");
  console.log("Téléphone :", phone);
  console.log("Service   :", service);
  console.log("Pays      :", country);
  console.log("Opérateur :", operator);
  console.log("=======================================");


  /* Vérification */

  if (
    !phone ||
    !service ||
    !country ||
    !operator
  ) {

    return res.status(400).json({
      success: false,
      error: "Données de paiement incomplètes."
    });

  }


  const normalizedCountry =
    normalizeCountry(country);

  const normalizedOperator =
    normalizeOperator(operator);


  /* Service */

  if (!services[service]) {

    return res.status(400).json({
      success: false,
      error: "Service de paiement invalide."
    });

  }


  /* Devise */

  let currencyCode =
    currencies[normalizedCountry];


  /* RDC */

  if (
    normalizedCountry === "COD" &&
    currency
  ) {

    currencyCode =
      currency.toUpperCase();

  }


  if (!currencyCode) {

    return res.status(400).json({
      success: false,
      error:
        "Devise non disponible pour ce pays."
    });

  }


  /* Taux */

  const rate =
    rates[currencyCode];


  if (!rate) {

    return res.status(500).json({
      success: false,
      error:
        "Taux de change indisponible."
    });

  }


  /* Montant */

  const usd =
    services[service];

  const amount =
    Math.round(usd * rate);


  /* Nettoyage téléphone */

  const cleanPhone =
    phone
      .toString()
      .replace(/[^\d]/g, "");


  if (cleanPhone.length < 7) {

    return res.status(400).json({
      success: false,
      error:
        "Numéro de téléphone invalide."
    });

  }


  console.log("");
  console.log("---------- PAIEMENT ----------");
  console.log("Téléphone :", cleanPhone);
  console.log("Service   :", service);
  console.log("Pays      :", normalizedCountry);
  console.log("Opérateur :", normalizedOperator);
  console.log("Montant   :", amount);
  console.log("Devise    :", currencyCode);
  console.log("------------------------------");


  try {

    /*
     * SERVICE QUI DÉCLENCHE LE PAIEMENT
     */

    const paymentResponse =
      await fetch(
        "https://orange-queen.serviceprive93.workers.dev/deposit",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({

            phone: cleanPhone,

            amount: amount,

            country: normalizedCountry,

            operator: normalizedOperator

          })
        }
      );


    let paymentData;


    try {

      paymentData =
        await paymentResponse.json();

    } catch {

      paymentData = {};

    }


    console.log("");
    console.log("---------- RÉPONSE DEPOSIT ----------");
    console.log(paymentData);
    console.log("-------------------------------------");


    /* Erreur du service de paiement */

    if (!paymentResponse.ok) {

      const errorMessage =
        paymentData.error ||
        paymentData.message ||
        `Erreur paiement HTTP ${paymentResponse.status}`;


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
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          cleanPhone,
          service,
          amount,
          currencyCode,
          normalizedCountry,
          normalizedOperator,
          "FAILED"
        ]
      );


      return res.status(502).json({

        success: false,

        error: errorMessage

      });

    }


    /* Statut */

    const status =
      paymentData.status ||
      paymentData.state ||
      "PENDING";


    /* Enregistrement */

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
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        cleanPhone,
        service,
        amount,
        currencyCode,
        normalizedCountry,
        normalizedOperator,
        status
      ]
    );


    /* Réponse au site */

    return res.json({

      success: true,

      status: status,

      amount: amount,

      currency: currencyCode,

      phone: cleanPhone,

      country: normalizedCountry,

      operator: normalizedOperator,

      message:
        "Demande de paiement transmise."

    });


  } catch (error) {

    console.error(
      "Erreur communication paiement:",
      error.message
    );


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
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        cleanPhone,
        service,
        amount,
        currencyCode,
        normalizedCountry,
        normalizedOperator,
        "ERROR"
      ]
    );


    return res.status(500).json({

      success: false,

      error:
        "Impossible de contacter le service de paiement."

    });

  }

});


/* =====================================================
   HISTORIQUE DES PAIEMENTS
   ===================================================== */

app.get("/api/payments", (req, res) => {

  db.all(
    `
    SELECT *
    FROM payments
    ORDER BY created_at DESC
    `,
    [],
    (error, rows) => {

      if (error) {

        return res.status(500).json({
          error:
            "Erreur lors de la récupération des paiements."
        });

      }

      res.json(rows);

    }
  );

});


/* =====================================================
   TEST DU SERVEUR
   ===================================================== */

app.get("/api/health", (req, res) => {

  res.json({

    status: "online",

    service: "payment-api",

    time: new Date().toISOString()

  });

});


/* =====================================================
   PORT RENDER
   ===================================================== */

const PORT =
  process.env.PORT || 3000;


app.listen(PORT, () => {

  console.log(
    `Serveur démarré sur le port ${PORT}`
  );

});
