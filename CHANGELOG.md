# Changelog

All notable changes to this project are documented here.
This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Initial release: merge/organize, split, watermark, page numbers, compress,
  PDF↔Word, PDF↔Images, Images→PDF, and a visual page editor.
- Python (`services/converter`) implementations of every PDF operation so the
  app can run as a two-service deployment (web + converter) on Vercel.
- Docker Compose setup for self-hosting all three services.
