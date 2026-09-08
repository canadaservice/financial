const express = require("express");
const fetch = require("node-fetch");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

// =====================================================
// CONFIGURATION RENDER
// =====================================================

const PORT = process.env.PORT || 3000;

const FEEXPAY_API_KEY = process.env.FEEXPAY_API_KEY;
const FEEXPAY_SHOP_ID = process.env.FEEXPAY_SHOP_ID;

// Vérification des variables
if (!FEEXPAY_API_KEY) {
  console.error("ERREUR : FEEXPAY_API_KEY n'est pas configurée.");
}

if (!FEEXPAY_SHOP_ID) {
  console.error("ERREUR : FEEXPAY_SHOP_ID n'est pas configurée.");
}

// =====================================================
// FICHIERS STATIQUES
// =====================================================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/logo.png", (req, res) => {
  res.sendFile(path.join(__dirname, "logo.png"));
});

app.get("/background.jpg", (req, res) => {
  res.sendFile(path.join(__dirname, "background.jpg"));
});

// =====================================================
// BASE DE DONNÉES
// =====================================================

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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Ajout des colonnes si votre ancienne base existe déjà
  db.run(
    `ALTER TABLE payments ADD COLUMN reference TEXT`,
    () => {}
  );

  db.run(
    `ALTER TABLE payments ADD COLUMN message TEXT`,
    () => {}
  );
});

// =====================================================
// SERVICES
// =====================================================

const services = {
  biometrie: 1,
  langue: 150,
  administratif: 220,
  total: 520
};

// =====================================================
// TAUX FIXE
// 1 USD = 550 XOF
// =====================================================

const USD_TO_XOF = 550;

// =====================================================
// NORMALISATION PAYS
// =====================================================

function normalizeCountry(country) {

  if (!country) return null;

  const value = String(country).trim().toUpperCase();

  const countries = {
    BJ: "BEN",
    BENIN: "BEN",
    BEN: "BEN",

    CI: "CIV",
    COTEIVOIRE: "CIV",
    CIV: "CIV",

    SN: "SEN",
    SENEGAL: "SEN",
    SEN: "SEN",

    TG: "TGO",
    TOGO: "TGO",
    TGO: "TGO",

    CM: "CMR",
    CAMEROUN: "CMR",
    CMR: "CMR",

    GA: "GAB",
    GABON: "GAB",
    GAB: "GAB",

    CG: "COG",
    CONGO: "COG",
    COG: "COG",

    CD: "COD",
    RDC: "COD",
    COD: "COD"
  };

  return countries[value] || value;
}

// =====================================================
// NORMALISATION OPÉRATEUR
// =====================================================

function normalizeOperator(operator) {

  if (!operator) return null;

  return String(operator)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

// =====================================================
// NETTOYAGE DU NUMÉRO
// =====================================================

function cleanPhone(phone) {

  if (!phone) return "";

  let value = String(phone)
    .replace(/\D/g, "");

  // Si le numéro commence déjà par 229
  if (value.startsWith("229")) {
    return value;
  }

  // Numéro béninois local : 01XXXXXXXX
  if (value.length === 10 && value.startsWith("01")) {
    return "229" + value;
  }

  // Ancien format béninois à 8 chiffres
  if (value.length === 8) {
    return "22901" + value;
  }

  return value;
}

// =====================================================
// VALIDATION DU NUMÉRO MTN BÉNIN
// =====================================================

function isValidBeninPhone(phone) {

  // FeexPay demande le numéro avec le préfixe 229
  // Exemple : 2290166000000

  if (!/^22901\d{8}$/.test(phone)) {
    return false;
  }

  return true;
}

// =====================================================
// API DE SANTÉ
// =====================================================

app.get("/api/health", (req, res) => {

  res.json({
    status: "online",
    service: "payment-api",
    feexpay: FEEXPAY_API_KEY && FEEXPAY_SHOP_ID
      ? "configured"
      : "not_configured",
    time: new Date().toISOString()
  });

});

// =====================================================
// PAIEMENT
// =====================================================

app.post("/api/pay", async (req, res) => {

  console.log("");
  console.log("========================================");
  console.log("========== NOUVELLE DEMANDE ===========");
  console.log("========================================");

  const {
    phone,
    service,
    country,
    operator
  } = req.body;

  const normalizedCountry = normalizeCountry(country);
  const normalizedOperator = normalizeOperator(operator);
  const cleanedPhone = cleanPhone(phone);

  console.log("Téléphone reçu :", phone);
  console.log("Téléphone nettoyé :", cleanedPhone);
  console.log("Service :", service);
  console.log("Pays :", normalizedCountry);
  console.log("Opérateur :", normalizedOperator);

  // ===================================================
  // VALIDATION
  // ===================================================

  if (!phone || !service || !country || !operator) {

    return res.status(400).json({
      error: "Données obligatoires manquantes."
    });

  }

  if (!services[service]) {

    return res.status(400).json({
      error: "Service de paiement invalide."
    });

  }

  // ===================================================
  // POUR CETTE VERSION :
  // MTN BÉNIN UNIQUEMENT
  // ===================================================

  if (
    normalizedCountry !== "BEN" ||
    normalizedOperator !== "mtn"
  ) {

    return res.status(400).json({
      error: "Cette version est configurée pour MTN Bénin."
    });

  }

  // ===================================================
  // VALIDATION NUMÉRO
  // ===================================================

  if (!isValidBeninPhone(cleanedPhone)) {

    console.log("Numéro refusé :", cleanedPhone);

    return res.status(400).json({
      error:
        "Numéro MTN Bénin invalide. Utilisez un numéro au format 01XXXXXXXX."
    });

  }

  // ===================================================
  // VÉRIFICATION FEEXPAY
  // ===================================================

  if (!FEEXPAY_API_KEY || !FEEXPAY_SHOP_ID) {

    console.error("FEEXPAY_API_KEY ou FEEXPAY_SHOP_ID manquant.");

    return res.status(500).json({
      error: "Configuration FeexPay manquante sur le serveur."
    });

  }

  // ===================================================
  // CALCUL DU MONTANT
  // ===================================================

  const usd = services[service];

  // Taux fixe :
  // 1 USD = 550 XOF

  const amount = Math.round(usd * USD_TO_XOF);

  const currency = "XOF";

  console.log("");
  console.log("------------- PAIEMENT -------------");
  console.log("Téléphone :", cleanedPhone);
  console.log("Service :", service);
  console.log("Pays :", normalizedCountry);
  console.log("Opérateur :", normalizedOperator);
  console.log("Prix USD :", usd);
  console.log("Taux :", USD_TO_XOF);
  console.log("Montant XOF :", amount);
  console.log("Devise :", currency);
  console.log("------------------------------------");

  // ===================================================
  // DESCRIPTION
  // ===================================================

  let description = "Paiement";

  if (service === "biometrie") {
    description = "Donnees biometriques";
  }

  if (service === "langue") {
    description = "Test de langue";
  }

  if (service === "administratif") {
    description = "Frais administratifs";
  }

  if (service === "total") {
    description = "Paiement services";
  }

  // ===================================================
  // REQUÊTE FEEXPAY
  // ===================================================

  try {

    const feexpayUrl =
      "https://api-v2.feexpay.me/api/transactions/public/requesttopay/mtn";

    console.log("");
    console.log("====== ENVOI VERS FEEXPAY ======");
    console.log("URL :", feexpayUrl);
    console.log("Shop :", FEEXPAY_SHOP_ID);
    console.log("Amount :", amount);
    console.log("Phone :", cleanedPhone);
    console.log("================================");

    const paymentRes = await fetch(feexpayUrl, {

      method: "POST",

      headers: {
        "Authorization": `Bearer ${FEEXPAY_API_KEY}`,
        "Content-Type": "application/json"
      },

      body: JSON.stringify({

        shop: FEEXPAY_SHOP_ID,

        amount: amount,

        phoneNumber: Number(cleanedPhone),

        description: description

      })

    });

    // =================================================
    // LECTURE DE LA RÉPONSE
    // =================================================

    const responseText = await paymentRes.text();

    let data;

    try {

      data = JSON.parse(responseText);

    } catch {

      data = {
        message: responseText
      };

    }

    console.log("");
    console.log("======= RÉPONSE FEEXPAY =======");
    console.log(data);
    console.log("HTTP :", paymentRes.status);
    console.log("===============================");

    // =================================================
    // ERREUR FEEXPAY
    // =================================================

    if (!paymentRes.ok) {

      const errorMessage =
        data.message ||
        data.error ||
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
          message
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          cleanedPhone,
          service,
          amount,
          currency,
          normalizedCountry,
          normalizedOperator,
          data.reference || null,
          data.status || "ERROR",
          errorMessage
        ]
      );

      return res.status(paymentRes.status).json({

        success: false,

        error: errorMessage,

        status: data.status || "ERROR",

        reference: data.reference || null

      });

    }

    // =================================================
    // RÉPONSE ACCEPTÉE
    // =================================================

    const status = data.status || "PENDING";

    const reference = data.reference || null;

    const message = data.message || "Accepted";

    // =================================================
    // ENREGISTREMENT
    // =================================================

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
        message
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        message
      ],
      (err) => {

        if (err) {

          console.error(
            "Erreur SQLite :",
            err.message
          );

        }

      }
    );

    // =================================================
    // RÉPONSE AU NAVIGATEUR
    // =================================================

    return res.json({

      success: true,

      status: status,

      reference: reference,

      message: message,

      amount: amount,

      currency: currency,

      phone: cleanedPhone

    });

  } catch (error) {

    console.error("");
    console.error("======= ERREUR FEEXPAY =======");
    console.error(error);
    console.error("==============================");

    return res.status(500).json({

      success: false,

      error:
        "Impossible de contacter le service de paiement."

    });

  }

});

// =====================================================
// HISTORIQUE DES PAIEMENTS
// =====================================================

app.get("/api/payments", (req, res) => {

  db.all(
    `
    SELECT *
    FROM payments
    ORDER BY created_at DESC
    `,
    [],
    (err, rows) => {

      if (err) {

        console.error(
          "Erreur SQLite :",
          err.message
        );

        return res.status(500).json({
          error: "Erreur base de données."
        });

      }

      res.json(rows);

    }
  );

});

// =====================================================
// PORT
// =====================================================

app.listen(PORT, () => {

  console.log("");
  console.log("========================================");
  console.log("       SERVEUR DE PAIEMENT ACTIF");
  console.log("========================================");
  console.log("Port :", PORT);
  console.log("FeexPay :", FEEXPAY_API_KEY ? "API KEY OK" : "API KEY MANQUANTE");
  console.log("Shop ID :", FEEXPAY_SHOP_ID ? "SHOP ID OK" : "SHOP ID MANQUANT");
  console.log("Taux USD/XOF :", USD_TO_XOF);
  console.log("========================================");
  console.log("");

});
