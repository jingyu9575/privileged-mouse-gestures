# Privileged Mouse Gestures

Privileged mouse gestures extension for Firefox. Unlike normal WebExtensions, it Works on Firefox's built-in pages, Mozilla's restricted pages and tabs that are loading.

## Download

The extension XPI files can be found at [releases](https://github.com/jingyu9575/privileged-mouse-gestures/releases).

As a privileged extension, this is unsigned and can only be installed on Firefox Developer Edition, Nightly, unbranded versions or some third-party builds.

## Build

Install the dependencies:

```sh
npm install --only=prod
```

The globally installed build tools can be used, found by `$PATH`. It is also possible to install the packages locally:

```sh
npm install --only=dev
```

Run the build script to generate the unpacked extension in `dist`:

```sh
node build
```

Create unsigned XPI release: (requires the `zip` command)

```sh
node build --xpi
```