require("dotenv").config();

const express = require("express");
const admin = require("firebase-admin");
const path = require("path");
const PDFDocument = require("pdfkit");
const fs = require("fs");

const app = express();

app.use(express.json());

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

app.use(
  "/pdfs",
  express.static(
    path.join(__dirname, "pdfs")
  )
);

const serviceAccount =
  JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT
  );

admin.initializeApp({
  credential:
    admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const PORT =
process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send(
    "GDEH Admission Automation Server Running"
  );
});
const courseCodes = {
  "Computer Literacy": "CL",
  "Smart Phone Literacy": "SPL",
  "Agro-entrepreneurship": "AGE"
};

async function generateRegistrationNumber(course) {

  const year = new Date().getFullYear();

  const code = courseCodes[course] || "GEN";
  const counterRef =
    db.collection("system")
      .doc(`counter_${code}`);

  const regNo =
    await db.runTransaction(async (transaction) => {

      const counterDoc =
        await transaction.get(counterRef);

      let count = 1;

      if (counterDoc.exists) {
        count =
          (counterDoc.data().count || 0) + 1;
      }

      transaction.set(counterRef, {
        count
      });

      return `GD-${code}-${String(count)
        .padStart(4, "0")}-${year}`;

    });

  return regNo;
}


app.get("/test-firestore", async (req, res) => {

  try {

    const snapshot =
      await db
      .collection("applications")
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

});
app.get("/test-reg", async (req, res) => {

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

});
async function createAdmissionLetter(student) {

  const fileName =
    `${student.registrationNo}.pdf`;

  const filePath =
    path.join(__dirname, "pdfs", fileName);

  const doc = new PDFDocument({
    margin: 50
  });

  doc.pipe(
    fs.createWriteStream(filePath)
  );

  const logoPath =
    path.join(
      __dirname,
      "public",
      "images",
      "gdeh_logo.png"
    );

  // LOGO
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

// Position directly below logo
doc.y = 95;

// TITLE
doc
  .fontSize(16)
  .text(
    "GARISSA DIGITAL EMPOWERMENT HUB (GDEH CBO)",
    {
      align: "center"
    }
  );

// ADDRESS
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

// Divider line
doc.moveDown(0.5);

doc.moveTo(50, doc.y)
   .lineTo(550, doc.y)
   .stroke();

// Admission Letter Heading
doc.moveDown(0.5);

doc
  .fontSize(12)
  .text(
    "OFFICIAL ADMISSION LETTER",
    {
      align: "center"
    }
  );

doc.moveDown(1);

doc.moveDown();
doc.moveDown(1);

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

doc.moveDown(1);

doc.text(
  `To: ${student.firstName} ${student.lastName}`
);

doc.moveDown();

doc.text(`
Dear ${student.firstName} ${student.lastName},

We are pleased to formally inform you that your application for admission to the Garissa Digital Empowerment Hub (GDEH CBO) has been reviewed and approved. Following the evaluation of your application details, you have successfully secured admission into the ${student.course} programme under Registration Number ${student.registrationNo}. We congratulate you on taking this important step toward strengthening your digital and professional skills.

Garissa Digital Empowerment Hub is committed to promoting digital literacy, innovation, entrepreneurship, and community transformation through practical and market-oriented training programmes. During your period of study, you will have the opportunity to acquire relevant knowledge, hands-on experience, and industry-oriented competencies that will enable you to participate effectively in the modern digital economy, improve employability, and create sustainable livelihood opportunities.

As an admitted learner, you are expected to demonstrate commitment, discipline, integrity, and active participation throughout your training journey. Kindly retain this admission letter for future reference as it may be required during registration, orientation, assessments, certification, and any official communication with the institution. We look forward to supporting your learning journey and helping you achieve your personal, educational, and professional goals.


Yours Faithfully,
`);


const signaturePath = path.join(
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

doc.text("Abdullahi Sheikh Aden");
doc.text("Programme Coordinator");
doc.text("GDEH CBO");

  doc.end();

  return fileName;
}

app.get("/test-pdf", async (req, res) => {

  try {

    const pdf =
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
      pdf
    });

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});

app.get("/approve/:id", async (req, res) => {

  try {

    const docId = req.params.id;

    const docRef =
      db.collection("applications")
        .doc(docId);

    const snapshot =
      await docRef.get();

    if (!snapshot.exists) {

      return res.status(404).send(
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
    const registrationNo =
      await generateRegistrationNumber(
        student.course
      );

    student.registrationNo =
  registrationNo;

await createAdmissionLetter(
  student
);

const pdfUrl =
  `${req.protocol}://${req.get("host")}/pdfs/${registrationNo}.pdf`;

await docRef.update({

  registrationNo,

  status: "Admitted",

  processed: true,

  admissionLetter:
    `${registrationNo}.pdf`,

  pdfUrl

}); 

    res.json({

      success: true,

      registrationNo,

      pdf:
        `${registrationNo}.pdf`

    });

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});
app.get("/applications", async (req, res) => {

  try {

    const snapshot =
      await db
        .collection("applications")
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

});


app.listen(PORT, () => {
  console.log(
    `Server running on port ${PORT}`
  );
});
