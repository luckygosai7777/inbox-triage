"""Recipient CSV parsing."""
from __future__ import annotations

from django.test import SimpleTestCase

from campaigns.services import csv_import


class CsvImportTests(SimpleTestCase):
    def test_headered_csv(self):
        text = (
            "email,name,org,role\n"
            "nadia@northwind.studio,Nadia Faruk,Northwind Studio,Senior Product Designer\n"
            "marcus.lee@heliolabs.com,Marcus Lee,Helio Labs,Product Design Lead\n"
        )
        result = csv_import.parse_recipients(text)
        self.assertTrue(result.detected_headers)
        self.assertEqual(len(result.rows), 2)
        self.assertEqual(result.rows[0]["name"], "Nadia Faruk")
        self.assertEqual(result.rows[1]["role"], "Product Design Lead")

    def test_alternative_header_names(self):
        text = "E-mail,Full Name,Company,Job Title\na@b.co,Ann Bee,Acme,Designer\n"
        result = csv_import.parse_recipients(text)
        self.assertEqual(result.rows[0]["org"], "Acme")
        self.assertEqual(result.rows[0]["role"], "Designer")

    def test_tab_delimited(self):
        text = "email\tname\torg\trole\na@b.co\tAnn Bee\tAcme\tDesigner\n"
        result = csv_import.parse_recipients(text)
        self.assertEqual(len(result.rows), 1)
        self.assertEqual(result.rows[0]["email"], "a@b.co")

    def test_semicolon_delimited(self):
        text = "email;name;org;role\na@b.co;Ann Bee;Acme;Designer\n"
        result = csv_import.parse_recipients(text)
        self.assertEqual(result.rows[0]["name"], "Ann Bee")

    def test_headerless_csv(self):
        text = "a@b.co,Ann Bee,Acme,Designer\nc@d.co,Cal Dee,Beta,Engineer\n"
        result = csv_import.parse_recipients(text)
        self.assertFalse(result.detected_headers)
        self.assertEqual(len(result.rows), 2)
        self.assertEqual(result.rows[0]["email"], "a@b.co")
        self.assertEqual(result.rows[0]["name"], "Ann Bee")

    def test_bare_address_list(self):
        result = csv_import.parse_recipients("a@b.co\nc@d.co\n")
        self.assertEqual([r["email"] for r in result.rows], ["a@b.co", "c@d.co"])

    def test_missing_name_is_derived_from_the_address(self):
        result = csv_import.parse_recipients("email\nnadia.faruk@northwind.studio\n")
        self.assertEqual(result.rows[0]["name"], "Nadia Faruk")
        self.assertEqual(result.rows[0]["org"], "Northwind")

    def test_invalid_rows_are_skipped_not_fatal(self):
        text = "email,name\nnot-an-email,Broken\na@b.co,Ann Bee\n"
        result = csv_import.parse_recipients(text)
        self.assertEqual(len(result.rows), 1)
        self.assertEqual(len(result.skipped), 1)

    def test_duplicates_are_dropped(self):
        text = "email,name\na@b.co,Ann\na@b.co,Ann Again\n"
        result = csv_import.parse_recipients(text)
        self.assertEqual(len(result.rows), 1)
        self.assertIn("a@b.co (duplicate)", result.skipped)

    def test_addresses_are_lowercased(self):
        result = csv_import.parse_recipients("email,name\nANN@B.CO,Ann\n")
        self.assertEqual(result.rows[0]["email"], "ann@b.co")

    def test_empty_input(self):
        result = csv_import.parse_recipients("")
        self.assertEqual(result.rows, [])

    def test_blank_lines_are_ignored(self):
        result = csv_import.parse_recipients("email,name\n\na@b.co,Ann\n\n")
        self.assertEqual(len(result.rows), 1)

    def test_byte_order_mark_is_stripped(self):
        result = csv_import.parse_recipients("﻿email,name\na@b.co,Ann\n")
        self.assertTrue(result.detected_headers)
        self.assertEqual(len(result.rows), 1)

    def test_fields_seen_reports_mapped_columns(self):
        result = csv_import.parse_recipients("email,name,org,role\na@b.co,Ann,Acme,Designer\n")
        self.assertEqual(result.fields_seen, ["email", "name", "org", "role"])
