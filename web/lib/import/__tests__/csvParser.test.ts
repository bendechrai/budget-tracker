import { describe, it, expect } from "vitest";
import { parseCSV, parseDate, type ColumnMapping } from "../csvParser";

describe("parseDate", () => {
  it("parses YYYY-MM-DD format", () => {
    const d = parseDate("2024-03-15");
    expect(d).toEqual(new Date(2024, 2, 15));
  });

  it("parses DD/MM/YYYY format when day > 12", () => {
    const d = parseDate("25/03/2024");
    expect(d).toEqual(new Date(2024, 2, 25));
  });

  it("parses MM/DD/YYYY format when month <= 12 and day > 12", () => {
    const d = parseDate("03/25/2024");
    expect(d).toEqual(new Date(2024, 2, 25));
  });

  it("defaults ambiguous dates to DD/MM/YYYY", () => {
    const d = parseDate("05/03/2024");
    // Ambiguous — defaults to DD/MM → 5 March 2024
    expect(d).toEqual(new Date(2024, 2, 5));
  });

  it("handles two-digit year", () => {
    const d = parseDate("15/03/24");
    expect(d).toEqual(new Date(2024, 2, 15));
  });

  it("handles dash separators", () => {
    const d = parseDate("15-03-2024");
    expect(d).toEqual(new Date(2024, 2, 15));
  });

  it("handles dot separators", () => {
    const d = parseDate("15.03.2024");
    expect(d).toEqual(new Date(2024, 2, 15));
  });

  it("returns null for invalid date", () => {
    expect(parseDate("not a date")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseDate("")).toBeNull();
  });
});

describe("parseCSV", () => {
  describe("auto-detect with headers", () => {
    it("parses a simple CSV with standard headers", () => {
      const csv = [
        "Date,Description,Amount",
        "2024-01-15,Grocery Store,-45.50",
        "2024-01-16,Salary,3000.00",
      ].join("\n");

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        date: new Date(2024, 0, 15),
        description: "Grocery Store",
        amount: 45.5,
        type: "debit",
        referenceId: null,
      });
      expect(result[1]).toEqual({
        date: new Date(2024, 0, 16),
        description: "Salary",
        amount: 3000.0,
        type: "credit",
        referenceId: null,
      });
    });

    it("detects separate credit/debit columns", () => {
      const csv = [
        "Date,Description,Credit,Debit",
        "2024-01-15,Refund,25.00,",
        "2024-01-16,Coffee,,4.50",
      ].join("\n");

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("credit");
      expect(result[0].amount).toBe(25.0);
      expect(result[1].type).toBe("debit");
      expect(result[1].amount).toBe(4.5);
    });

    it("handles type column", () => {
      const csv = [
        "Date,Description,Amount,Type",
        "2024-01-15,Payment,100.00,Debit",
        "2024-01-16,Deposit,500.00,Credit",
      ].join("\n");

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("debit");
      expect(result[1].type).toBe("credit");
    });

    it("detects reference ID column", () => {
      const csv = [
        "Date,Description,Amount,Ref No",
        "2024-01-15,Transfer,-200.00,TXN12345",
      ].join("\n");

      const result = parseCSV(csv);

      expect(result).toHaveLength(1);
      expect(result[0].referenceId).toBe("TXN12345");
    });

    it("handles case-insensitive headers", () => {
      const csv = [
        "TRANSACTION DATE,MEMO,VALUE",
        "2024-01-15,Electric Bill,-120.00",
      ].join("\n");

      const result = parseCSV(csv);

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe("Electric Bill");
      expect(result[0].amount).toBe(120.0);
    });
  });

  describe("CSV parsing edge cases", () => {
    it("handles quoted fields with commas", () => {
      const csv = [
        "Date,Description,Amount",
        '2024-01-15,"Coffee, Tea, and Snacks",-12.00',
      ].join("\n");

      const result = parseCSV(csv);

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe("Coffee, Tea, and Snacks");
    });

    it("handles quoted fields with escaped quotes", () => {
      const csv = [
        "Date,Description,Amount",
        '2024-01-15,"Joe""s Diner",-25.00',
      ].join("\n");

      const result = parseCSV(csv);

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('Joe"s Diner');
    });

    it("handles currency symbols in amounts", () => {
      const csv = [
        "Date,Description,Amount",
        "2024-01-15,Purchase,$45.99",
      ].join("\n");

      const result = parseCSV(csv);

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(45.99);
    });

    it("handles parenthetical negative amounts", () => {
      const csv = [
        "Date,Description,Amount",
        "2024-01-15,Withdrawal,(100.00)",
      ].join("\n");

      const result = parseCSV(csv);

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(100.0);
      expect(result[0].type).toBe("debit");
    });

    it("handles comma-formatted numbers", () => {
      const csv = [
        "Date,Description,Amount",
        "2024-01-15,Large Payment,\"1,500.00\"",
      ].join("\n");

      const result = parseCSV(csv);

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(1500.0);
    });

    it("skips blank lines", () => {
      const csv = [
        "Date,Description,Amount",
        "2024-01-15,Item One,-10.00",
        "",
        "2024-01-16,Item Two,-20.00",
        "",
      ].join("\n");

      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
    });

    it("returns empty array for empty input", () => {
      expect(parseCSV("")).toEqual([]);
    });

    it("returns empty array for unrecognizable CSV", () => {
      const csv = "just,some,random,text\nmore,random,stuff,here";
      expect(parseCSV(csv)).toEqual([]);
    });

    it("handles Windows-style line endings", () => {
      const csv = "Date,Description,Amount\r\n2024-01-15,Test,-10.00\r\n";
      const result = parseCSV(csv);
      expect(result).toHaveLength(1);
    });

    it("skips rows with missing date", () => {
      const csv = [
        "Date,Description,Amount",
        "2024-01-15,Good Row,-10.00",
        ",Missing Date,-20.00",
      ].join("\n");

      const result = parseCSV(csv);
      expect(result).toHaveLength(1);
    });

    it("skips rows with unparseable amount", () => {
      const csv = [
        "Date,Description,Amount",
        "2024-01-15,Good Row,-10.00",
        "2024-01-16,Bad Amount,abc",
      ].join("\n");

      const result = parseCSV(csv);
      expect(result).toHaveLength(1);
    });
  });

  describe("auto-detect without headers", () => {
    it("detects layout from data patterns", () => {
      const csv = [
        "2024-01-10,Opening Balance,1000.00",
        "2024-01-11,Coffee Shop,-4.50",
        "2024-01-12,Salary,3000.00",
        "2024-01-13,Rent,-1200.00",
      ].join("\n");

      const result = parseCSV(csv);

      expect(result).toHaveLength(4);
      expect(result[1].description).toBe("Coffee Shop");
      expect(result[1].amount).toBe(4.5);
      expect(result[1].type).toBe("debit");
    });
  });

  describe("manual column mapping", () => {
    it("uses provided column mapping", () => {
      const csv = [
        "ID,When,What,How Much",
        "001,2024-01-15,Groceries,-50.00",
      ].join("\n");

      const mapping: ColumnMapping = {
        date: 1,
        description: 2,
        amount: 3,
        referenceId: 0,
      };

      const result = parseCSV(csv, mapping);

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe("Groceries");
      expect(result[0].referenceId).toBe("001");
    });

    it("manual mapping with separate credit/debit columns", () => {
      const csv = [
        "When,What,In,Out",
        "2024-01-15,Deposit,500.00,",
        "2024-01-16,Payment,,200.00",
      ].join("\n");

      const mapping: ColumnMapping = {
        date: 0,
        description: 1,
        amount: 2,
        creditAmount: 2,
        debitAmount: 3,
      };

      const result = parseCSV(csv, mapping);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("credit");
      expect(result[0].amount).toBe(500.0);
      expect(result[1].type).toBe("debit");
      expect(result[1].amount).toBe(200.0);
    });

    it("manual mapping skips header row", () => {
      const csv = [
        "Custom Header 1,Custom Header 2,Custom Header 3",
        "2024-01-15,Groceries,-50.00",
      ].join("\n");

      const mapping: ColumnMapping = {
        date: 0,
        description: 1,
        amount: 2,
      };

      const result = parseCSV(csv, mapping);

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe("Groceries");
    });
  });

  describe("common date formats", () => {
    it("handles DD/MM/YYYY dates in CSV", () => {
      const csv = [
        "Date,Description,Amount",
        "25/01/2024,Purchase,-30.00",
      ].join("\n");

      const result = parseCSV(csv);

      expect(result).toHaveLength(1);
      expect(result[0].date).toEqual(new Date(2024, 0, 25));
    });

    it("handles YYYY-MM-DD dates in CSV", () => {
      const csv = [
        "Date,Description,Amount",
        "2024-06-15,Purchase,-30.00",
      ].join("\n");

      const result = parseCSV(csv);

      expect(result).toHaveLength(1);
      expect(result[0].date).toEqual(new Date(2024, 5, 15));
    });
  });
});
