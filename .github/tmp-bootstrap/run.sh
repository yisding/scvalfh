#!/usr/bin/env bash
# TEMPORARY. Step 1: discover the candidate WCAL/WBAL schools' girls soccer teams and leagues.
set -uo pipefail
pnpm exec tsx .github/tmp-bootstrap/discover.ts \
  0f63870a-34f3-4d5b-9dbf-653c8410f969 e1db3a4f-3bcf-4281-a574-d313212296a1 \
  de6d3780-e8f6-4a2a-93f2-b5d89499f9b0 8a8c04d2-5606-44cf-9993-34db55474240 \
  1dc4836b-4daf-4573-b525-27b474bd5366 ea81d3e5-b4ae-4673-afda-207b10865ffe \
  6ffd5704-345e-4ec2-bfa4-0aff6800306b e5d23742-6a32-47e1-b752-d16dfcf77119 \
  f133ba52-590e-4f91-b798-d9c06fd9fc4c 27d82a51-2b44-492e-b2cf-114730027de3 \
  65205c0e-02f1-4b46-8b8a-e310b62d1249 8c578d8d-b5c7-4f3a-a428-6ed79089ccaa \
  5e75f63f-09f0-4922-8a9d-78e239e9c1f9 aabdd1c5-8378-485d-91d3-75827048bf70 \
  67c08b6d-5f06-432a-a783-aee8b2a7a939 ac9c9167-10bf-4859-bc74-7eb0f69517c6 \
  b22f99e1-f106-4b39-8d64-35983d4da891
