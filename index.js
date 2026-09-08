const express = require("express");
const fetch = require("node-fetch");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

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


/* =========================
   SERVICES
========================= */

const services = {
  biometrie: 150,
  langue: 150,
  administratif: 220,
  total: 520
};


/* =========================
   DEVISES
========================= */

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


/* =========================
   TAUX
========================= */

let rates = {
  XOF: 550,
  XAF: 550,
  CDF: 2800
};

async function loadRates() {
  try {
    const response = await fetch(
      "https://open.er-api.com/v6/latest/USD"
    );

    if (!response.ok) {
      throw new Error("Impossible de récupérer les taux");
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
      "Erreur chargement des taux:",
      error.message
    );

    console.log(
      "Utilisation des taux de secours."
    );
  }
}

loadRates();


/* =========================
   NORMALISATION PAYS
========================= */

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


/* =========================
   NORMALISATION OPERATEUR
========================= */

function normalizeOperator(operator) {

  if (!operator) {
    return "";
  }

  return operator
    .toString()
    .trim()
    .toLowerCase();
}


/* =========================
   PAIEMENT
========================= */

app.post("/api/pay", async (req, res) => {

  const {
    phone,
    service,
    country,
    operator,
    currency
  } = req.body;


  if (
    !phone ||
    !service ||
    !country ||
    !operator
  ) {

    return res.status(400).json({
      error: "Données de paiement incomplètes."
    });

  }


  const normalizedCountry =
    normalizeCountry(country);

  const normalizedOperator =
    normalizeOperator(operator);


  if (!services[service]) {

    return res.status(400).json({
      error: "Service de paiement invalide."
    });

  }


  let paymentCurrency =
    currencies[normalizedCountry];


  /*
   * RDC :
   * possibilité de préciser la devise.
   */

  if (
    normalizedCountry === "COD" &&
    currency
  ) {

    paymentCurrency =
      currency.toUpperCase();

  }


  if (!paymentCurrency) {

    return res.status(400).json({
      error: "Devise non disponible pour ce pays."
    });

  }


  const rate =
    rates[paymentCurrency];


  if (!rate) {

    return res.status(500).json({
      error:
        "Taux de change indisponible pour " +
        paymentCurrency
    });

  }


  const usd =
    services[service];


  const amount =
    Math.round(usd * rate);


  /*
   * Nettoyage du numéro
   */

  const cleanPhone =
    phone
      .toString()
      .replace(/[^\d]/g, "");


  if (cleanPhone.length < 7) {

    return res.status(400).json({
      error: "Numéro de téléphone invalide."
    });

  }


  console.log("============== PAIEMENT ==============");
  console.log("Téléphone :", cleanPhone);
  console.log("Service   :", service);
  console.log("Pays      :", normalizedCountry);
  console.log("Opérateur :", normalizedOperator);
  console.log("Montant   :", amount);
  console.log("Devise    :", paymentCurrency);
  console.log("=======================================");


  try {

    /*
     * Appel du service de paiement.
     *
     * Cette adresse doit être l'endpoint
     * qui déclenche réellement le Mobile Money.
     */

    const paymentRes =
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


    let data = {};

    try {

      data =
        await paymentRes.json();

    } catch {

      data = {
        status: "UNKNOWN"
      };

    }


    console.log(
      "Réponse paiement :",
      data
    );


    if (!paymentRes.ok) {

      const errorMessage =
        data.error ||
        data.message ||
        `Erreur paiement (${paymentRes.status})`;


      db.run(
        `
        INSERT INTO payments
        (phone, service, amount, currency, country, operator, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          cleanPhone,
          service,
          amount,
          paymentCurrency,
          normalizedCountry,
          normalizedOperator,
          "FAILED"
        ]
      );


      return res.status(paymentRes.status).json({
        error: errorMessage
      });

    }


    const status =
      data.status ||
      data.state ||
      "PENDING";


    /*
     * Enregistrement de la transaction
     */

    db.run(
      `
      INSERT INTO payments
      (phone, service, amount, currency, country, operator, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        cleanPhone,
        service,
        amount,
        paymentCurrency,
        normalizedCountry,
        normalizedOperator,
        status
      ]
    );


    /*
     * Réponse au navigateur
     */

    return res.json({

      success: true,

      status: status,

      amount: amount,

      currency: paymentCurrency,

      phone: cleanPhone,

      country: normalizedCountry,

      operator: normalizedOperator

    });


  } catch (error) {

    console.error(
      "Erreur serveur paiement:",
      error
    );


    db.run(
      `
      INSERT INTO payments
      (phone, service, amount, currency, country, operator, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        cleanPhone,
        service,
        amount,
        paymentCurrency,
        normalizedCountry,
        normalizedOperator,
        "ERROR"
      ]
    );


    return res.status(500).json({
      error:
        "Impossible de contacter le service de paiement."
    });

  }

});


/* =========================
   HISTORIQUE
========================= */

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
          error: "Erreur lors de la récupération."
        });

      }

      res.json(rows);

    }
  );

});


/* =========================
   TEST SERVEUR
========================= */

app.get("/api/health", (req, res) => {

  res.json({
    status: "online",
    service: "payment-api",
    time: new Date().toISOString()
  });

});


/* =========================
   PORT
========================= */

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(
    `Serveur démarré sur le port ${PORT}`
  );

});
