/**
 * The English text of the group `lookup` (stage B4). It is typed against the
 * Turkish source in `lookup-tr.ts`: a missing key and an extra key fail the type
 * check (FND-08 rule 1). The consent text is the draft of the owner's mockup
 * (DEC-098).
 */
import type { Dictionary } from "./tr";

export const lookupEn: Dictionary["lookup"] = {
  title: "Find the instructions for use",
  intro:
    "Enter the catalog number and the LOT number of the product. We show the version of the instructions for use that applies to that LOT: not the newest version, but the version in force on the day the LOT was made.",
  verify: {
    title: "Enter the product and your email address",
    catalogNumber: "Catalog number",
    catalogNumberHint: "It is printed on the box. Example: BS-GHPV-L-100",
    lotNumber: "LOT number",
    lotNumberHint: "It is printed on the box. Enter it as it is written, with the same upper and lower case.",
    email: "Email address",
    emailHint:
      "The verification code goes to this address. The access record needs it. We do not send you marketing messages.",
    consent:
      "I have read this text and give my explicit consent to the processing of my personal data for the purposes stated here.",
    submit: "Send verification code",
    submitting: "Sending the code…",
  },
  notice: {
    title: "Information on the processing of personal data, and consent",
    version: "Text version {version}",
    draft: "This text is a draft and is awaiting approval by Bioeksen's legal function.",
    intro:
      "Your email address is verified before the instructions for use are released. Below is what is processed, why, for how long, and what your rights are.",
    collected: {
      title: "What is processed",
      body: "Your email address, your IP address, the catalog and LOT number you looked up, the revision of the instructions served to you, and the time. First and last name are optional and only if you give them.",
    },
    purpose: {
      title: "Purpose and lawful basis",
      body: "Two grounds: (1) traceability required by in vitro diagnostic regulation — being able to show which revision was served to whom, and to issue a field safety notice if one becomes necessary; (2) your explicit consent, given through this text. You will not be sent marketing.",
    },
    retention: {
      title: "Retention",
      body: "The fields that identify you are kept for 10 years and then irreversibly cleared. The access event itself — which product, which LOT, which revision, when — is retained without identifying anybody. The identifying fields are encrypted in the database and can be viewed only by an authorised person, with their reason recorded.",
    },
    rights: {
      title: "Your rights",
      body: "Under KVKK Art. 11 you may access your data and ask for it to be corrected or erased. Write to kvkk@bioeksen.com.tr. On an erasure request the fields identifying you are cleared; because of the traceability obligation the access event itself remains, naming nobody.",
    },
    withdraw: {
      title: "Withdrawal of consent",
      body: "You may withdraw your consent at any time at the same address. Withdrawal takes effect going forward; where regulation requires the record to be kept, it is kept without identifying you.",
    },
  },
  code: {
    title: "Verify your email address",
    sent: "We sent a six-digit code to {email}. The code is valid for 10 minutes.",
    label: "Verification code",
    hint: "We ask for the code so that we can record reliably who received the instructions for use.",
    submit: "Verify and get the instructions",
    submitting: "Verifying…",
    restart: "Start again",
    attempts: "Attempts that remain: {count}",
    exhausted: "You have no attempts left. Start again.",
  },
  result: {
    title: "Result",
    catalogNumber: "Catalog number",
    lotNumber: "LOT number",
    manufacturingDate: "Manufacturing date",
    productName: "Product",
    documentTitle: "Document",
    documentNumber: "Document number",
    revision: "Revision",
    overrideNote: "An authorized user has set a specific document version for this LOT.",
    files: "Files to download",
    documentType: "Instructions for use",
    fileLink: "{type}, {language}, PDF",
    newLookup: "Look up another LOT",
  },
  languages: {
    tr: "Turkish",
    en: "English",
    de: "German",
    fr: "French",
    es: "Spanish",
  },
  outcomeCode: "Outcome code: {code}",
  outcomes: {
    CATALOG_NUMBER_NOT_FOUND: {
      title: "The catalog number was not found",
      body: "We have no record of this catalog number. Check that you entered the number as it is printed on the box.",
    },
    LOT_NOT_FOUND: {
      title: "The LOT number was not found",
      body: "We have no record of this LOT number for this catalog number. Enter the LOT number as it is printed on the box, with the same upper and lower case.",
    },
    LOT_CATALOG_MISMATCH: {
      title: "The LOT number belongs to another catalog number",
      body: "This LOT number does not belong to the catalog number that you entered. Check the catalog number and the LOT number on the box again.",
    },
    LOT_DATE_CONFLICT: {
      title: "The manufacturing date of the LOT could not be confirmed",
      body: "We could not confirm the manufacturing date of this LOT in our records. We cannot give the correct instructions for use now. Contact Bioeksen.",
    },
    NO_APPLICABLE_VERSION: {
      title: "No instructions for use apply to this LOT",
      body: "We found no version of the instructions for use that was in force on the manufacturing date of this LOT. Contact Bioeksen.",
    },
    AMBIGUOUS_APPLICABILITY: {
      title: "More than one version of the instructions for use seems to apply",
      body: "We cannot decide now which version applies to this LOT. Contact Bioeksen.",
    },
    NO_FILE_FOR_VERSION: {
      title: "The instructions for use have no file",
      body: "We found the version that applies to this LOT, but this version has no file to download. Contact Bioeksen.",
    },
    OVERRIDE_TARGET_NOT_PUBLISHED: {
      title: "The version that was set for this LOT is not published",
      body: "The version of the instructions for use that was set for this LOT is not published now. Contact Bioeksen.",
    },
  },
  issues: {
    required: "This field is required.",
    outOfRange: "The value is too long.",
    noticeNotAccepted: "Give your explicit consent to continue.",
    noticeVersionNotCurrent: "The information text has changed. Reload the page, read the new text and give your consent again.",
    codeWrong: "The code is not correct.",
    verificationNotFound: "This verification was not found. Start again.",
  },
  errors: {
    verify: {
      "VAL-4001": "The catalog number, the LOT number or the email address is missing.",
      "VAL-4006": "One or more values are not valid. See the notes under the fields.",
      "UP-5500": "The verification code mail failed: the mail service does not answer now. Try again in a moment.",
      "UP-5501": "The verification code mail failed: the mail service did not answer in time. Try again in a moment.",
      "UP-5000": "The verification code mail failed: the mail service did not accept the message. Check the email address.",
    },
    code: {
      "VAL-4006": "The verification code is not valid.",
      "RES-4302":
        "This verification can no longer be used. The code may be used, expired, or out of attempts. The code mail may also have failed. Start again.",
      "DB-5001": "The access record could not be written, so we did not give the instructions for use. Try again.",
    },
  },
};
