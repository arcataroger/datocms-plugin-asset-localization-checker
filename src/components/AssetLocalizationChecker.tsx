import { Button, Canvas, Section, Spinner } from "datocms-react-ui";
import type {
  FileFieldValue,
  RenderFieldExtensionCtx,
} from "datocms-plugin-sdk";
import type { Upload } from "@datocms/cma-client/dist/types/generated/SimpleSchemaTypes";
import { buildClient } from "@datocms/cma-client-browser";
import { useEffect, useMemo, useState } from "react";
import { humanReadableLocale } from "../utils/humanReadableLocale.ts"; // It's mostly the same as the CMA "Upload" type, but with an upload_id added

type MetadataByLocale = {
  locale: string;
  alt: string | null;
  title: string | null;
};

/*type Validators = {
  required_alt_title?: {
    title?: boolean;
    alt?: boolean;
  };
};*/

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
      attributes: { label },
    },
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
  });

  // Basic vars
  const imageField = formValues[fieldPath] as FileFieldValue; // Current field the plugin is attached to
  const { upload_id, alt: defaultAlt, title: defaultTitle } = imageField;

  // States
  const [assetData, setAssetData] = useState<Upload>();
  const metadata = assetData?.default_field_metadata ?? null;
  const locales = (formValues?.internalLocales as string[]) ?? null;
  const isReady = assetData && metadata && locales;

  // Calculations
  const metadataByLocale = useMemo<MetadataByLocale[]>(() => {
    if (!metadata || !locales) return [];
    return locales.flatMap((locale) => {
      return [
        {
          locale: locale,
          alt: metadata[locale]?.alt ?? null,
          title: metadata[locale]?.title ?? null,
        },
      ];
    });
  }, [locales, metadata]);

  const missingAlts = useMemo(
    () => metadataByLocale.filter((locale) => !locale.alt),
    [metadataByLocale],
  );

  const missingTitles = useMemo(
    () => metadataByLocale.filter((locale) => !locale.title),
    [metadataByLocale],
  );

  /** Look up asset details from the CMA **/
  const fetchUpload = async () => {
    try {
      const asset = await client.uploads.find(upload_id);
      if (asset) {
        setAssetData(asset);
      } else {
        throw new Error(
          `Could not retrieve asset ID ${upload_id}. Please check your console log or ask a developer for help.`,
        );
      }
    } catch (error) {
      console.error(error);
      await ctx.alert(`Error: ${error}`);
    }
  };

  const editImage = async () => {
    const uploadResult = await ctx.editUpload(upload_id);
    if (uploadResult) {
      await fetchUpload();
    }
  };

  useEffect(() => {
    fetchUpload();
  }, [upload_id]);

  if (!isReady) {
    return (
      <Canvas ctx={ctx}>
        <Spinner size={24} /> Loading, please wait...
      </Canvas>
    );
  }

  return (
    <Canvas ctx={ctx}>
      {missingAlts.length >= 1 && (
        <Section
          title={`⚠️ Missing alt text detected in ${missingAlts.length} locale(s):`}
        >
          <ul>
            {missingAlts.map((loc) => {
              return (
                <li>
                  <strong>{humanReadableLocale(loc.locale)}</strong> does not
                  have alt text specified at the asset level.
                </li>
              );
            })}
          </ul>
          <Button buttonSize={"xxs"} onClick={async () => await editImage()}>
            Fix: Edit the asset to add alt text for each locale
          </Button>
        </Section>
      )}
      {missingTitles.length >= 1 && (
        <Section
          title={`⚠️ Missing title detected in ${missingTitles.length} locale(s):`}
          headerStyle={{ marginTop: "1em" }}
        >
          <ul>
            {missingTitles.map((loc) => {
              return (
                <li>
                  <strong>{humanReadableLocale(loc.locale)}</strong> does not
                  have a title specified at the asset level.
                </li>
              );
            })}
          </ul>
          <Button buttonSize={"xxs"} onClick={async () => await editImage()}>
            Fix: Edit the asset to add a title for each locale
          </Button>
        </Section>
      )}
      {(defaultAlt || defaultTitle) && (
        <Section
          title={`⚠️ Field-level override(s) detected`}
          headerStyle={{ marginTop: "1em" }}
        >
          <p>
            You also have field-level override(s) specified in the "{label}"
            field:
            <ul>
              {defaultAlt && <li>Alt: "{defaultAlt}"</li>}
              {defaultTitle && <li>Title: "{defaultTitle}"</li>}
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
            onClick={() => {
              ctx.navigateTo(`#`);
              ctx.navigateTo(`#fieldPath=${fieldPath}`);
              ctx.scrollToField(fieldPath);
            }}
          >
            Fix: Edit the field itself to remove override(s)
          </Button>
        </Section>
      )}
    </Canvas>
  );
};
