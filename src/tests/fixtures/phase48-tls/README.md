These certificates and the server private key are synthetic test fixtures only.
They have no relation to Supabase or production. The CA files are padded with
PEM whitespace to the runner's fixed 1367-byte contract. The valid fixtures expire
in 2040; the expired fixture expired in 2021. SAN on the server is localhost.
Never use this test CA or private key outside isolated loopback tests.
