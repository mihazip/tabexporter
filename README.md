# TabExporter

A Firefox for Android extension that exports your open tabs as a list you can save, share or copy.

- **Formats:** plain text (`title | url`), Markdown links, or CSV
- **Save file** writes `tabs_<date>_<time>.<ext>` to your Downloads folder
- **Share** hands the list to any Android app (notes, email, messaging)
- **Copy to clipboard** for pasting anywhere

## Install

Requires Firefox for Android 142 or later. Each [release](../../releases/latest) has a signed `.xpi`.

1. On the phone, download `tabexporter-<version>.xpi` from the latest release.
2. In Firefox open **Settings → About Firefox** and tap the Firefox logo five times to unlock the debug menu.
3. Back in **Settings**, choose **Install extension from file**, pick the `.xpi` and confirm with **Add**.

After the first install the extension updates itself from new releases.

## Use

Firefox for Android has no extension toolbar. Open **⋮ menu → Extensions → TabExporter**, pick a format, then tap **Save file**, **Share** or **Copy to clipboard**.

It also runs on desktop Firefox, where it saves through the downloads API.

## Privacy

TabExporter makes no network requests and collects nothing. It uses the `tabs` permission to read the titles and URLs of your open tabs, and `downloads` on desktop Firefox to save the file. The list only goes where you send it.

## Development

Plain Manifest V3 JavaScript with no build step. To try it without signing, load it as a temporary add-on (`about:debugging` on desktop, or `web-ext run -t firefox-android` over USB). See [RELEASING.md](RELEASING.md) for versioning, CI and signing.

## License

[MIT](LICENSE)
