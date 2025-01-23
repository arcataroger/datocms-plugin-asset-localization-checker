import { connect } from "datocms-plugin-sdk";
import "datocms-react-ui/styles.css";
import { render } from "./utils/render";
import { AssetLocalizationChecker } from "./components/AssetLocalizationChecker.tsx";

connect({
  manualFieldExtensions() {
    return [
      {
        id: "assetLocalizationChecker",
        name: "Asset Localization Checker",
        type: "addon",
        fieldTypes: ["file"],
      },
    ];
  },
  renderFieldExtension(id, ctx) {
    if (id === "assetLocalizationChecker") {
      render(<AssetLocalizationChecker ctx={ctx} />);
    }
  },
});
