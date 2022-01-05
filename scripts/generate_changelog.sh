# Must set ENV CHANGELOG_GITHUB_TOKEN to the Github token

# TODO: Set as argument
SINCE_TAG=v0.32.0
CHANGELOG_OUTPUT_PATH=./CHANGELOG.md

docker run --rm \
  -v "$(pwd)":/usr/local/src/your-app \
  -e CHANGELOG_GITHUB_TOKEN \
  githubchangeloggenerator/github-changelog-generator \
  --user chainsafe \
  --project lodestar \
  --issues false \
  --pull-requests true \
  --pr-wo-labels true \
  --usernames-as-github-logins true \
  --compare-link true \
  --filter-by-milestone false \
  --unreleased false \
  --exclude-labels meta-excludefromchangelog \
  --since-tag $SINCE_TAG \
  --output $CHANGELOG_OUTPUT_PATH

# Strip generator notice.
echo "Stripping generator notice."
sed -i '/This Changelog was automatically generated/d' "$CHANGELOG_OUTPUT_PATH"
