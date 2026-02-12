import { describe, it, expect } from "vitest";
import { parseOFX, parseOFXDate } from "../ofxParser";

describe("parseOFXDate", () => {
  it("parses YYYYMMDD format", () => {
    const d = parseOFXDate("20240315");
    expect(d).toEqual(new Date(2024, 2, 15));
  });

  it("parses YYYYMMDDHHMMSS format", () => {
    const d = parseOFXDate("20240315120000");
    expect(d).toEqual(new Date(2024, 2, 15));
  });

  it("parses date with timezone offset", () => {
    const d = parseOFXDate("20240315120000.000[-5:EST]");
    expect(d).toEqual(new Date(2024, 2, 15));
  });

  it("returns null for empty string", () => {
    expect(parseOFXDate("")).toBeNull();
  });

  it("returns null for short string", () => {
    expect(parseOFXDate("2024")).toBeNull();
  });

  it("returns null for invalid date", () => {
    expect(parseOFXDate("not-a-date")).toBeNull();
  });

  it("returns null for invalid month", () => {
    expect(parseOFXDate("20241315")).toBeNull();
  });
});

describe("parseOFX", () => {
  const sampleOFX = `
OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20240315120000
<LANGUAGE>ENG
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1001
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>USD
<BANKACCTFROM>
<BANKID>123456789
<ACCTID>987654321
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20240101
<DTEND>20240315
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240115
<TRNAMT>-45.50
<FITID>2024011501
<NAME>GROCERY STORE
<MEMO>Purchase at grocery
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20240116
<TRNAMT>3000.00
<FITID>2024011601
<NAME>EMPLOYER INC
<MEMO>Salary deposit
</STMTTRN>
<STMTTRN>
<TRNTYPE>CHECK
<DTPOSTED>20240120
<TRNAMT>-200.00
<FITID>2024012001
<CHECKNUM>1042
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>5234.50
<DTASOF>20240315
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

  it("parses all transactions from OFX content", () => {
    const result = parseOFX(sampleOFX);
    expect(result).toHaveLength(3);
  });

  it("extracts debit transaction correctly", () => {
    const result = parseOFX(sampleOFX);
    expect(result[0]).toEqual({
      date: new Date(2024, 0, 15),
      description: "GROCERY STORE",
      amount: 45.5,
      type: "debit",
      referenceId: "2024011501",
    });
  });

  it("extracts credit transaction correctly", () => {
    const result = parseOFX(sampleOFX);
    expect(result[1]).toEqual({
      date: new Date(2024, 0, 16),
      description: "EMPLOYER INC",
      amount: 3000.0,
      type: "credit",
      referenceId: "2024011601",
    });
  });

  it("uses CHECKNUM for description when NAME is absent", () => {
    const result = parseOFX(sampleOFX);
    expect(result[2].description).toBe("Check #1042");
    expect(result[2].type).toBe("debit");
    expect(result[2].amount).toBe(200.0);
  });

  it("extracts reference ID (FITID) for all transactions", () => {
    const result = parseOFX(sampleOFX);
    expect(result[0].referenceId).toBe("2024011501");
    expect(result[1].referenceId).toBe("2024011601");
    expect(result[2].referenceId).toBe("2024012001");
  });

  it("falls back to MEMO when NAME is missing", () => {
    const ofx = `
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240201
<TRNAMT>-15.00
<FITID>20240201001
<MEMO>Coffee shop purchase
</STMTTRN>`;

    const result = parseOFX(ofx);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("Coffee shop purchase");
  });

  it("handles various TRNTYPE values", () => {
    const types = [
      { type: "DEP", expected: "credit" },
      { type: "DIRECTDEP", expected: "credit" },
      { type: "INT", expected: "credit" },
      { type: "ATM", expected: "debit" },
      { type: "POS", expected: "debit" },
      { type: "XFER", expected: "debit" },
      { type: "FEE", expected: "debit" },
      { type: "SRVCHG", expected: "debit" },
      { type: "PAYMENT", expected: "debit" },
    ];

    for (const { type, expected } of types) {
      const ofx = `
<STMTTRN>
<TRNTYPE>${type}
<DTPOSTED>20240201
<TRNAMT>${expected === "credit" ? "100.00" : "-100.00"}
<FITID>TEST${type}
<NAME>Test ${type}
</STMTTRN>`;

      const result = parseOFX(ofx);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe(expected);
    }
  });

  it("falls back to amount sign for unknown TRNTYPE", () => {
    const ofx = `
<STMTTRN>
<TRNTYPE>OTHER
<DTPOSTED>20240201
<TRNAMT>50.00
<FITID>TEST001
<NAME>Unknown type positive
</STMTTRN>
<STMTTRN>
<TRNTYPE>OTHER
<DTPOSTED>20240201
<TRNAMT>-50.00
<FITID>TEST002
<NAME>Unknown type negative
</STMTTRN>`;

    const result = parseOFX(ofx);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("credit");
    expect(result[1].type).toBe("debit");
  });

  it("returns empty array for empty input", () => {
    expect(parseOFX("")).toEqual([]);
  });

  it("returns empty array for OFX with no transactions", () => {
    const ofx = `
OFXHEADER:100
<OFX>
<SIGNONMSGSRSV1>
<SONRS><STATUS><CODE>0</STATUS></SONRS>
</SIGNONMSGSRSV1>
</OFX>`;

    expect(parseOFX(ofx)).toEqual([]);
  });

  it("skips transactions with missing required fields", () => {
    const ofx = `
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240201
<TRNAMT>-10.00
<FITID>GOOD001
<NAME>Good transaction
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<TRNAMT>-10.00
<FITID>BAD001
<NAME>Missing date
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240201
<FITID>BAD002
<NAME>Missing amount
</STMTTRN>`;

    const result = parseOFX(ofx);
    expect(result).toHaveLength(1);
    expect(result[0].referenceId).toBe("GOOD001");
  });

  it("handles OFX with closing tags", () => {
    const ofx = `
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20240201</DTPOSTED>
<TRNAMT>-25.00</TRNAMT>
<FITID>XML001</FITID>
<NAME>XML-style OFX</NAME>
</STMTTRN>`;

    const result = parseOFX(ofx);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("XML-style OFX");
    expect(result[0].amount).toBe(25.0);
  });

  it("handles date with timezone info", () => {
    const ofx = `
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240315120000.000[-5:EST]
<TRNAMT>-10.00
<FITID>TZ001
<NAME>Timezone test
</STMTTRN>`;

    const result = parseOFX(ofx);
    expect(result).toHaveLength(1);
    expect(result[0].date).toEqual(new Date(2024, 2, 15));
  });

  it("stores amount as absolute value", () => {
    const ofx = `
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240201
<TRNAMT>-99.99
<FITID>ABS001
<NAME>Negative amount
</STMTTRN>`;

    const result = parseOFX(ofx);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(99.99);
  });

  it("handles QFX format (same as OFX)", () => {
    const qfx = `
OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>POS
<DTPOSTED>20240301
<TRNAMT>-12.99
<FITID>QFX001
<NAME>COFFEE SHOP
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

    const result = parseOFX(qfx);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("COFFEE SHOP");
    expect(result[0].amount).toBe(12.99);
    expect(result[0].type).toBe("debit");
  });
});
