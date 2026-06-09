require("dotenv").config();

const express = require("express");
const admin = require("firebase-admin");
const path = require("path");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const cors = require("cors");
const cloudinary = require("cloudinary").v2;

const app = express();

/* ------------------ MIDDLEWARE ------------------ */

app.use(cors({
  origin:
    "https://garissadigitaltraining.onrender.com"
}));

app.use(express.json());

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

/* ------------------ FIREBASE ------------------ */

let serviceAccount;

if (
  process.env.FIREBASE_SERVICE_ACCOUNT
) {

  serviceAccount =
    JSON.parse(
      process.env
        .FIREBASE_SERVICE_ACCOUNT
    );

} else {

  serviceAccount =
    require("./firebase-admin.json");

}

admin.initializeApp({

  credential:
    admin.credential.cert(
      serviceAccount
    )

});

const db = admin.firestore();

/* ------------------ CLOUDINARY ------------------ */

cloudinary.config({

  cloud_name:
    process.env.CLOUDINARY_CLOUD_NAME,

  api_key:
    process.env.CLOUDINARY_API_KEY,

  api_secret:
    process.env.CLOUDINARY_API_SECRET

});

/* ------------------ PORT ------------------ */

const PORT =
  process.env.PORT || 3000;

/* ------------------ HOME ------------------ */

app.get("/", (req, res) => {

  res.send(
    "GDEH Admission Automation Server Running"
  );

});

/* ------------------ COURSE CODES ------------------ */

const courseCodes = {

  "Computer Literacy": "CL",

  "Smart Phone Literacy": "SPL",

  "Agro-entrepreneurship": "AGE"

};

/* ------------------ REGISTRATION NUMBER ------------------ */

async function generateRegistrationNumber(
  course
) {

  const year =
    new Date().getFullYear();

  const code =
    courseCodes[course] || "GEN";

  const counterRef =
    db.collection("system")
      .doc(`counter_${code}`);

  const regNo =
    await db.runTransaction(
      async (transaction) => {

        const counterDoc =
          await transaction.get(
            counterRef
          );

        let count = 1;

        if (counterDoc.exists) {

          count =
            (
              counterDoc.data().count || 0
            ) + 1;

        }

        transaction.set(
          counterRef,
          { count }
        );

        return `GD-${code}-${String(count)
          .padStart(4, "0")}-${year}`;

      }
    );

  return regNo;

}

/* ------------------ CREATE PDF ------------------ */

async function createAdmissionLetter(
  student
) {

  const tempDir =
    path.join(__dirname, "temp");

  if (!fs.existsSync(tempDir)) {

    fs.mkdirSync(tempDir, {
      recursive: true
    });

  }

  const fileName =
    `${student.registrationNo}.pdf`;

  const filePath =
    path.join(tempDir, fileName);

  const doc =
    new PDFDocument({
      margin: 50
    });

  const stream =
    fs.createWriteStream(filePath);

  doc.pipe(stream);

  /* ---------- LOGO ---------- */

  const logoPath =
    path.join(
      __dirname,
      "public",
      "images",
      "gdeh_logo.png"
    );

  if (fs.existsSync(logoPath)) {

    doc.image(
      logoPath,
      255,
      20,
      {
        width: 70
      }
    );

  }

  doc.y = 95;

  /* ---------- HEADER ---------- */

  doc
    .fontSize(16)
    .text(
      "GARISSA DIGITAL EMPOWERMENT HUB (GDEH CBO)",
      {
        align: "center"
      }
    );

  doc
    .fontSize(9)
    .text(
      "P.O BOX 10-70100, Garissa Township",
      {
        align: "center"
      }
    );

  doc.text(
    "Along Wajir Rd Off Rubis Energy Opp. Horizon High School",
    {
      align: "center"
    }
  );

  doc.moveDown(0.5);

  doc.moveTo(50, doc.y)
     .lineTo(550, doc.y)
     .stroke();

  doc.moveDown(0.5);

  doc
    .fontSize(12)
    .text(
      "OFFICIAL ADMISSION LETTER",
      {
        align: "center"
      }
    );

  doc.moveDown(2);

  /* ---------- STUDENT DETAILS ---------- */

  doc.fontSize(11);

  doc.text(
    `Admission Date: ${new Date().toLocaleDateString()}`
  );

  doc.text(
    `Reference No: ${student.registrationNo}`
  );

  doc.moveDown();

  doc.text(
    `Student Name: ${student.firstName} ${student.lastName}`
  );

  doc.text(
    `Registration Number: ${student.registrationNo}`
  );

  doc.text(
    `Course Admitted: ${student.course}`
  );

  doc.text(
    `Intake: ${student.intake}`
  );

  doc.text(
    `Mode of Study: ${student.mode}`
  );

  doc.moveDown();

  /* ---------- LETTER ---------- */

  doc.text(`
Dear ${student.firstName} ${student.lastName},

We are pleased to formally inform you that your application for admission to the Garissa Digital Empowerment Hub (GDEH CBO) has been reviewed and approved. Following the evaluation of your application details, you have successfully secured admission into the ${student.course} programme under Registration Number ${student.registrationNo}.

Garissa Digital Empowerment Hub is committed to promoting digital literacy, innovation, entrepreneurship, and community transformation through practical and market-oriented training programmes.

We congratulate you on taking this important step toward strengthening your digital and professional skills.

Yours Faithfully,
`);

  /* ---------- SIGNATURE ---------- */

  const signaturePath =
    path.join(
      __dirname,
      "public",
      "images",
      "signature.jpg"
    );

  if (fs.existsSync(signaturePath)) {

    doc.moveDown();

    doc.image(
      signaturePath,
      {
        width: 70
      }
    );

  }

  doc.moveDown();

  doc.text(
    "Abdullahi Sheikh Aden"
  );

  doc.text(
    "Programme Coordinator"
  );

  doc.text(
    "GDEH CBO"
  );

  doc.end();

  /* ---------- UPLOAD TO CLOUDINARY ---------- */

  return new Promise(
    (resolve, reject) => {

      stream.on(
        "finish",
        async () => {

          try {

            const result =
              await cloudinary
                .uploader
                .upload(
                  filePath,
                  {

                    resource_type: "raw",

type: "upload",

access_mode: "public",

folder:
  "admission_letters",

public_id:
  student.registrationNo

                  }
                );

            /* DELETE TEMP FILE */

            fs.unlinkSync(filePath);

            resolve({

              fileName,

              pdfUrl:
                result.secure_url

            });

          } catch (err) {

            reject(err);

          }

        }
      );

    }
  );

}

/* ------------------ TEST FIRESTORE ------------------ */

app.get(
  "/test-firestore",
  async (req, res) => {

    try {

      const snapshot =
        await db
          .collection(
            "applications"
          )
          .limit(5)
          .get();

      const records = [];

      snapshot.forEach(doc => {

        records.push({

          id: doc.id,

          ...doc.data()

        });

      });

      res.json(records);

    } catch (err) {

      res.status(500).json({
        error: err.message
      });

    }

  }
);

/* ------------------ TEST REGISTRATION ------------------ */

app.get(
  "/test-reg",
  async (req, res) => {

    try {

      const regNo =
        await generateRegistrationNumber(
          "Smart Phone Literacy"
        );

      res.json({
        registrationNo: regNo
      });

    } catch (err) {

      res.status(500).json({
        error: err.message
      });

    }

  }
);

/* ------------------ TEST PDF ------------------ */

app.get(
  "/test-pdf",
  async (req, res) => {

    try {

      const pdfData =
        await createAdmissionLetter({

          firstName: "Hassan",

          lastName: "Ahmed",

          registrationNo:
            "GD-SPL-9999-2026",

          course:
            "Smart Phone Literacy",

          intake:
            "January Intake",

          mode:
            "Online"

        });

      res.json({

        success: true,

        pdfUrl:
          pdfData.pdfUrl

      });

    } catch (err) {

      res.status(500).json({
        error: err.message
      });

    }

  }
);

/* ------------------ APPROVE APPLICATION ------------------ */

app.get(
  "/approve/:id",
  async (req, res) => {

    try {

      const docId =
        req.params.id;

      const docRef =
        db.collection(
          "applications"
        ).doc(docId);

      const snapshot =
        await docRef.get();

      if (!snapshot.exists) {

        return res
          .status(404)
          .send(
            "Application not found"
          );

      }

      const student =
        snapshot.data();

      if (student.processed) {

        return res.send(
          "Already processed"
        );

      }

      /* GENERATE REG NUMBER */

      const registrationNo =
        await generateRegistrationNumber(
          student.course
        );

      student.registrationNo =
        registrationNo;

      /* CREATE PDF */

      const pdfData =
        await createAdmissionLetter(
          student
        );

      /* UPDATE FIRESTORE */

      await docRef.update({

        registrationNo,

        status: "Admitted",

        processed: true,

        admissionLetter:
          pdfData.fileName,

        pdfUrl:
          pdfData.pdfUrl

      });

      res.json({

        success: true,

        registrationNo,

        pdfUrl:
          pdfData.pdfUrl

      });

    } catch (err) {

      res.status(500).json({
        error: err.message
      });

    }

  }
);

/* ------------------ GET APPLICATIONS ------------------ */

app.get(
  "/applications",
  async (req, res) => {

    try {

      const snapshot =
        await db
          .collection(
            "applications"
          )
          .get();

      const students = [];

      snapshot.forEach(doc => {

        students.push({

          id: doc.id,

          ...doc.data()

        });

      });

      res.json(students);

    } catch (err) {

      res.status(500).json({
        error: err.message
      });

    }

  }
);

/* ------------------ TRACK APPLICATION ------------------ */

app.get(
  "/track/:applicationNo",
  async (req, res) => {

    try {

      const applicationNo =
        req.params.applicationNo;

      const snapshot =
        await db
          .collection(
            "applications"
          )
          .where(
            "applicationNo",
            "==",
            applicationNo
          )
          .get();

      if (snapshot.empty) {

        return res
          .status(404)
          .json({
            error:
              "Application not found"
          });

      }

      const student =
        snapshot.docs[0].data();

      res.json(student);

    } catch (err) {

      res.status(500).json({
        error: err.message
      });

    }

  }
);

/* ------------------ START SERVER ------------------ */

app.listen(PORT, () => {

  console.log(
    `Server running on port ${PORT}`
  );

});
