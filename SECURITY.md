# Security policy

Map Tunisia ships static files (SVG, GeoJSON, TopoJSON, CSV) and a small dependency-free JavaScript helper.

If you find a security problem — for example markup in a generated SVG that could execute script, or an
issue in the build tooling — please **do not open a public issue**. Use GitHub's
[private vulnerability reporting](https://github.com/Alaa-Taieb/map-tunisia/security/advisories/new) instead.
You will get an answer within a week.

Generated SVGs contain no `<script>` elements, event-handler attributes or external references; this is
checked by the test suite.
