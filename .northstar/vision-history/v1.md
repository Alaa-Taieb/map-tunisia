# Map Tunisia — Vision

## Where the project stands (24 October 2026)
Version 1.0.0 is shipped. The maps have been public on GitHub since 17 October 2026 (OpenStreetMap extract of 2026-10-16), the package is published on npm as `map-tunisia`, and the v1.0.0 GitHub release carries versioned per-format ZIPs with SHA-256 checksums. Work now is maintenance (the explorer link is broken) and the optional layers listed in the README roadmap.

## Purpose
Map Tunisia is a free, open-source and highly accurate set of SVG maps of Tunisia. It offers every official administrative level, from the national outline down to the 2,000+ sectors (imadas), at several levels of detail and in several ready-to-use visual modes. Anyone who needs a map of Tunisia should be able to drop in a correct, well-labelled and well-documented file in seconds, and trust its borders, names and codes.

## Target audience
- Web and app developers building dashboards, election or census visualisations, store locators and data journalism.
- Designers and educators who need a clean, correct map for print, slides or teaching material.
- Researchers, NGOs, journalists and public-sector teams who need consistent boundaries and official codes.
- GIS users who want clean, topologically consistent GeoJSON/TopoJSON for Tunisia.

## Problems it solves
- Freely available Tunisia SVGs are usually crude, outdated, missing islands, or stop at the 24 governorates.
- Boundaries from different sources don't line up between levels, so delegations spill out of their governorates.
- Names and codes are inconsistent (spelling, Arabic vs Latin, no ISO/INS codes), which makes joining data painful.
- Newer partitions (the 2023 districts, the economic regions) are hard to find as maps.
- Licensing and provenance are often unclear.

## Core functionality
- **Partitions:** country, 7 economic regions, 5 districts (2023 decree), 24 governorates, delegations (mutamadiyat) and sectors (imadas). All of them nest exactly inside one another.
- **Levels of detail:** from full precision for print and zoom down to tiny files for icons and thumbnails, with documented tolerances and file sizes.
- **Modes:** plain (styling-ready), outline, light, dark, labelled in Latin script, labelled in Arabic, nested borders and interactive (hover and tooltips with no JavaScript).
- **Rich identifiers:** ISO 3166-2, INS geocodes, HASC, and Arabic, French and English names on every shape. Exposed as `id`/`data-*` attributes, plus CSV/JSON tables.
- **Companion data:** GeoJSON and TopoJSON for every partition and level of detail, plus a documented projection and helper so users can place their own longitude/latitude points on the SVG.
- **Distribution:** files in `dist/` (CDN-ready), an npm package with TypeScript types and subpath exports for the data and map files, and versioned release ZIPs per format with a checksum file.
- **Reproducible build:** one command rebuilds everything from the latest OpenStreetMap data, with automated validation.

## Differentiators
- Accuracy first: the latest OpenStreetMap data, the real coastline with islands, an exact nested topology, and an accuracy report with metrics.
- Breadth: every official level down to imadas, plus the modern district and region groupings.
- Developer experience: semantic IDs and attributes, accessible SVG (titles, roles), a gallery and explorer site, and copy-paste examples.
- A transparent methodology that documents every correction applied to the source data.

## Principles
Accuracy over convenience, with every correction documented. Each file must be self-contained and work by itself. Standards first (ISO codes, valid SVG, open formats). Generous documentation. Credit the community and the author.

## Constraints
- Open data only, with clear licences: OpenStreetMap data (ODbL) with attribution; code under MIT.
- Built with free tooling: Python for extraction, Node.js for generation. No paid services.
- The repository stays a reasonable size: generated files have size budgets.

## Explicitly excluded
- Roads, terrain and other topographic layers. Version 1 is about administrative partitions; the only extra layers considered are the optional ones on the roadmap (municipalities as a separate non-nested partition, a water layer, city and capital points, extra label modes), each added only without weakening accuracy or the nested partitions.
- A tile server or a general-purpose web-mapping library.
- Political claims beyond the internationally recognised borders.

## Definition of long-term success
Map Tunisia becomes the default answer to "where do I get a good map of Tunisia?". Developers, newsrooms and institutions use it, contributors report and fix data issues, and Alaa Taieb is credited as its creator.
