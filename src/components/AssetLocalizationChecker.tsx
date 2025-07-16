import { Button, Canvas, Section, Spinner } from "datocms-react-ui";
import type {
  FileFieldValue,
  RenderFieldExtensionCtx,
} from "datocms-plugin-sdk";
import type { Upload } from "@datocms/cma-client/dist/types/generated/SimpleSchemaTypes";
import { buildClient } from "@datocms/cma-client-browser";
import { useEffect, useMemo, useState } from "react";
import { humanReadableLocale } from "../utils/humanReadableLocale.ts";

type MetadataByLocale = Map<
  string,
  {
    alt: string | null;
    title: string | null;
  }
>;

type AltTitleValidators = {
  required_alt_title?: {
    title: boolean;
    alt: boolean;
  };
};

export const AssetLocalizationChecker = ({
  ctx,
}: {
  ctx: RenderFieldExtensionCtx;
}) => {
  const {
    formValues,
    fieldPath,
    currentUserAccessToken,
    field: {
      attributes: { label, validators, localized: isFieldLocalized },
    },
    environment,
    locale,
  } = ctx;

  /** Make sure we have the token. We need this for CMA lookups. Exit early if not. **/
  if (!currentUserAccessToken) {
    (async () => {
      await ctx.alert(
        "The Asset Localization Checker plugin does not have access to your user token. Please check the plugin settings.",
      );
    })();

    return (
      <Canvas ctx={ctx}>
        <p>
          Asset Localization Checker error: No `currentUserAccessToken`
          provided. Please check your plugin settings.
        </p>
      </Canvas>
    );
  }

  /** Initialize the plugin **/
  // Set up CMA client
  const client = buildClient({
    apiToken: currentUserAccessToken,
    ...(environment ? { environment } : {}),
  });

  // States
  const [assetData, setAssetData] = useState<Upload>();
  const [siteLocales, setSiteLocales] = useState<string[]>([locale]);

  // Variables and calculations
  const imageField = formValues[fieldPath] as FileFieldValue; // Current field the plugin is attached to
  const { upload_id, alt: fieldLevelAlt, title: fieldLevelTitle } = imageField;
  const typedValidators = validators as AltTitleValidators;
  const metadata = assetData?.default_field_metadata ?? null;
  const localesInThisRecord = (formValues?.internalLocales as string[]) ?? null;
  const localeName = humanReadableLocale(locale);
  const isTitleRequired: boolean = !!typedValidators?.required_alt_title?.title;
  const isAltRequired: boolean = !!typedValidators?.required_alt_title?.alt;
  const isReady = assetData && metadata && localesInThisRecord;

  // Fetch all the site locales; we need to know the default to calculate inheritance
  useEffect(() => {
    (async () => {
      const settings = await ctx.getSettings();
      const {
        site: {
          attributes: { locales },
        },
      } = settings;
      setSiteLocales(locales);
    })();
  }, []);

  const defaultLocale = siteLocales[0];

  // Map the API data into more usable shapes
  const {
    assetLevelMetadataByLocale,
    localesMissingAlts,
    localesMissingTitles,
  } = useMemo<{
    assetLevelMetadataByLocale: MetadataByLocale;
    localesMissingAlts: string[];
    localesMissingTitles: string[];
  }>(() => {
    const _meta: MetadataByLocale = new Map();
    const _alt: string[] = [];
    const _title: string[] = [];

    if (metadata && localesInThisRecord) {
      for (const locale of localesInThisRecord) {
        const alt = metadata[locale]?.alt ?? null;
        const title = metadata[locale]?.title ?? null;
        _meta.set(locale, { alt, title });
        if (!alt) _alt.push(locale);
        if (!title) _title.push(locale);
      }
    }

    return {
      assetLevelMetadataByLocale: _meta,
      localesMissingAlts: _alt,
      localesMissingTitles: _title,
    };
  }, [metadata, localesInThisRecord]);

  // Look up the current locale
  const { isMissingAlt, isMissingTitle, actualAlt, actualTitle } = useMemo<{
    isMissingAlt: boolean;
    isMissingTitle: boolean;
    actualAlt: string;
    actualTitle: string;
  }>(() => {
    const _meta = assetLevelMetadataByLocale.get(locale);

    if (!_meta) {
      return {
        isMissingAlt: !fieldLevelAlt,
        isMissingTitle: !fieldLevelTitle,
        actualAlt: fieldLevelAlt ?? "",
        actualTitle: fieldLevelTitle ?? "",
      };
    }

    const { alt, title } = _meta;
    return {
      isMissingAlt: !fieldLevelAlt && !alt,
      isMissingTitle: !fieldLevelTitle && !title,
      actualAlt: fieldLevelAlt ?? alt ?? "",
      actualTitle: fieldLevelTitle ?? title ?? "",
    };
  }, [locale, assetLevelMetadataByLocale]);

  // Function to look up asset metadata from the CMA
  const fetchAsset = async () => {
    try {
      const asset = await client.uploads.find(upload_id);
      if (asset) {
        setAssetData(asset);
      } else {
        throw new Error(
          `Could not retrieve asset ID ${upload_id}. Please check your console log or ask a developer for help.`,
        ); // TODO Better handle ApiErrors
      }
    } catch (error) {
      console.error(error);
      await ctx.alert(`Error: ${error}`);
    }
  };

  // Function to open the image editor (for setting alt & title)
  const editImage = async () => {
    const uploadResult = await ctx.editUpload(upload_id);

    // If it's changed, we need to update the metadata... we don't get it from the CMS directly
    if (uploadResult) {
      await fetchAsset();
    }
  };

  // Function to navigate to the field itself
  const navigateToField = async () => {
    await ctx.navigateTo(`#`);
    await ctx.navigateTo(`#fieldPath=${fieldPath}`);
    await ctx.scrollToField(fieldPath);
  };

  // Function to edit the field-level metadata
  const editFieldMetadata = async () => {
    const editResult = await ctx.editUploadMetadata(imageField);

    // If it's changed, we need to update the metadata... we don't get it from the CMS directly
    if (editResult) {
      await fetchAsset();
    }
  };

  // Initial metadata fetch
  useEffect(() => {
    fetchAsset();
  }, [upload_id]);

  if (!isReady) {
    return (
      <Canvas ctx={ctx}>
        <Spinner size={24} /> Loading, please wait...
      </Canvas>
    );
  }

  const currentLocaleChecker = ({
    name,
    value,
    isMissing,
    isRequired,
    isFieldLevel,
  }: {
    name: string;
    value: string;
    isMissing: boolean;
    isRequired: boolean;
    isFieldLevel: boolean;
  }) => {
    if (isMissing) {
      if (isRequired) {
        return (
          <li>
            ‼️ {localeName} has no {name}
          </li>
        );
      } else {
        return (
          <li>
            ℹ️ {localeName} has no {name}, but it's not required
          </li>
        );
      }
    } else if (isFieldLevel) {
      return (
        <>
          <li>
            ℹ️ Using {humanReadableLocale(defaultLocale)} {name} from "{label}"
            field: "<strong>{value}</strong>"
          </li>
          {!isFieldLocalized && locale !== defaultLocale && (
            <li>
              <strong>
                ⚠️ Warning: The "{label}" field has {name} set. This overrides
                anything set in the image itself.
              </strong>{" "}
              If this isn't what you intended, first{" "}
              <a
                href={""}
                onClick={async () => {
                  await editFieldMetadata();
                }}
              >
                <strong>edit the field to remove the field-level {name}</strong>
              </a>{" "}
              and then{" "}
              <a href="" onClick={async () => await editImage()}>
                <strong>
                  use the media editor to set the {localeName} asset-level{" "}
                  {name}
                </strong>
              </a>
              .
            </li>
          )}
        </>
      );
    } else {
      return (
        <li>
          ✅ {localeName} {name} set in{" "}
          {assetData?.filename ? `"${assetData.filename}"` : "image"}: "
          <strong>{value}</strong>"
        </li>
      );
    }
  };

  return (
    <Canvas ctx={ctx}>
      <Section title={`Asset Localization Checker`}>
        <h3>Current locale: {localeName}</h3>
        <ul>
          {currentLocaleChecker({
            name: "title",
            value: actualTitle,
            isMissing: isMissingTitle,
            isRequired: isTitleRequired,
            isFieldLevel: !!fieldLevelTitle,
          })}

          {currentLocaleChecker({
            name: "alt text",
            value: actualAlt,
            isMissing: isMissingAlt,
            isRequired: isAltRequired,
            isFieldLevel: !!fieldLevelAlt,
          })}
        </ul>
      </Section>

      {localesMissingAlts.length >= 1 && (
        <Section
          title={`⚠️ Missing alt text detected in ${localesMissingAlts.length} locale(s):`}
        >
          <ul>
            {localesMissingAlts.map((loc) => {
              return (
                <li>
                  <strong>{humanReadableLocale(loc)}</strong> does not have alt
                  text specified at the asset level.
                </li>
              );
            })}
          </ul>
          <Button buttonSize={"xxs"} onClick={async () => await editImage()}>
            Fix: Edit the asset to add alt text for each locale
          </Button>
        </Section>
      )}
      {localesMissingTitles.length >= 1 && (
        <Section
          title={`⚠️ Missing title detected in ${localesMissingTitles.length} locale(s):`}
          headerStyle={{ marginTop: "1em" }}
        >
          <ul>
            {localesMissingTitles.map((loc) => {
              return (
                <li>
                  <strong>{humanReadableLocale(loc)}</strong> does not have a
                  title specified at the asset level.
                </li>
              );
            })}
          </ul>
          <Button buttonSize={"xxs"} onClick={async () => await editImage()}>
            Fix: Edit the asset to add a title for each locale
          </Button>
        </Section>
      )}
      {(fieldLevelAlt || fieldLevelTitle) && (
        <Section
          title={`⚠️ Field-level override(s) detected`}
          headerStyle={{ marginTop: "1em" }}
        >
          <p>
            You also have field-level override(s) specified in the "{label}"
            field:
            <ul>
              {fieldLevelAlt && <li>Alt: "{fieldLevelAlt}"</li>}
              {fieldLevelTitle && <li>Title: "{fieldLevelTitle}"</li>}
            </ul>
          </p>
          <p>
            <strong>
              This overrides any asset-level text specified, meaning all locales
              will use this value instead.
            </strong>
          </p>
          <Button
            buttonSize={"xxs"}
            onClick={async () => {
              await navigateToField();
            }}
          >
            Fix: Edit the field itself to remove override(s)
          </Button>
        </Section>
      )}
    </Canvas>
  );
};
