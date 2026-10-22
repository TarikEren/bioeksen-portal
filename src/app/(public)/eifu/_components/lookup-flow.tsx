"use client";

/**
 * The flow of the lookup page `/eifu`: the verification step, the code step and
 * the result in one page (IFU-70 rule 2, IFU-70.AC1, AC3, AC10, DEC-097).
 *
 * It holds the step in client state and never in the URL: the address, the
 * catalog number and the LOT number are personal or business data that must not
 * reach a URL, a log or a shared link (`sds-nextjs-frontend` §2). The state keeps
 * nothing in the browser storage. The flow decides nothing about a lookup: the
 * server checks the verification, the code and the resolution, and each step shows
 * what the server answered. After a step, the heading of the new step takes focus
 * (IFU-70.AC10), except on the first step when the page opens. "Start again" and
 * "look up another LOT" go back to the first step with the typed values, so that a
 * mistyped digit does not make the person type everything again. The consent box
 * is never kept: the person gives consent again for each verification (DEC-087).
 */
import { useState } from "react";

import type { FailureLabels } from "@/app/_components/failure";
import type { LookupAnswer } from "@/lib/schemas/lookup";

import { CodeStep } from "./code-step";
import type { LookupCopy } from "../_lib/lookup-copy";
import { LookupResult } from "./lookup-result";
import { type LookupInputs, VerificationStep } from "./verification-step";

type FlowState =
  | { readonly step: "verify"; readonly initial: LookupInputs; readonly moved: boolean }
  | { readonly step: "code"; readonly verificationId: string; readonly inputs: LookupInputs }
  | { readonly step: "result"; readonly answer: LookupAnswer; readonly inputs: LookupInputs };

const EMPTY_INPUTS: LookupInputs = { catalogNumber: "", lotNumber: "", email: "" };

interface LookupFlowProps {
  readonly copy: LookupCopy;
  readonly verifyFailure: FailureLabels;
  readonly codeFailure: FailureLabels;
  /** The value of `EIFU_LEGAL_NOTICE_VERSION`. */
  readonly noticeVersion: string;
}

export function LookupFlow({ copy, verifyFailure, codeFailure, noticeVersion }: LookupFlowProps) {
  const [flow, setFlow] = useState<FlowState>({ step: "verify", initial: EMPTY_INPUTS, moved: false });

  switch (flow.step) {
    case "verify":
      return (
        <VerificationStep
          copy={copy}
          failure={verifyFailure}
          noticeVersion={noticeVersion}
          initial={flow.initial}
          focusHeading={flow.moved}
          onCreated={(verificationId, inputs) => {
            setFlow({ step: "code", verificationId, inputs });
          }}
        />
      );
    case "code":
      return (
        <CodeStep
          copy={copy}
          failure={codeFailure}
          verificationId={flow.verificationId}
          email={flow.inputs.email}
          onResolved={(answer) => {
            setFlow({ step: "result", answer, inputs: flow.inputs });
          }}
          onRestart={() => {
            setFlow({ step: "verify", initial: flow.inputs, moved: true });
          }}
        />
      );
    case "result":
      return (
        <LookupResult
          copy={copy}
          answer={flow.answer}
          onNewLookup={() => {
            setFlow({ step: "verify", initial: { ...flow.inputs, lotNumber: "" }, moved: true });
          }}
        />
      );
    default: {
      const unreachable: never = flow;
      return unreachable;
    }
  }
}
