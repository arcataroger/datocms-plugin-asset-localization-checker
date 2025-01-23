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
      attributes: { validators, label, api_key },
    },
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
          <Button
            buttonSize={"s"}
            onClick={() => {
              ctx.editUpload(upload_id);
            }}
          >
            Edit the asset to add alt text
          </Button>
        </Section>
      )}
      {defaultAlt && metadataByLocale.length >= 1 && (
        <Section
          title={`⚠️ Field-level override detected`}
          headerStyle={{ marginTop: "1em" }}
        >
          <p>
            You also have a field-level override specified in the "{label}"
            field:
            <ul>
              <li>"{defaultAlt}"</li>
            </ul>
          </p>
          <p>
            <strong>
              This overrides any asset-level alt text specified, meaning all
              locales will use this value
            </strong>
            . If that isn't what you intended, hover over the field and edit it
            to remove the field-level override first, then edit the asset and
            set the alt text for each locale there.
          </p>
        </Section>
      )}
      <h2>Debug</h2>
      <pre>{JSON.stringify(formValues[fieldPath], null, 2)}</pre>
    </Canvas>
  );
};
