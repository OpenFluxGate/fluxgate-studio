# Offline deployment tests

Run `python -m unittest discover -s tests/deployment -p 'test_*.py' -v` with PyYAML installed. Seventeen mock tests cover API activation/rollback, UI directory switching/TERM rollback, fail-closed marker/runtime-env checks, and workflow ordering/guards/assets/version contracts. They never connect to SSH or production. macOS mocks replace flock and GNU chmod; real server permissions and durability remain unverified. See deploy/candidate/README.en.md.
