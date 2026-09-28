import * as React from "react";
import {
  SpeelEntityTable,
  useOverlays,
  useSpeelUI,
  type SpeelEntityTableHandle,
} from "@speel/react";
import { ProjectArtifact } from "../../../entities/ProjectArtifact";

/** Document-library demo: artifacts table; adds go through the imperative overlay (showDocumentForm). */
export const ArtifactsPanel: React.FC<{
  tableRef: React.RefObject<SpeelEntityTableHandle>;
}> = ({ tableRef }) => {
  const ui = useSpeelUI();
  const { toast, showDocumentForm } = useOverlays();

  const addArtifact = async (): Promise<void> => {
    const { action } = await showDocumentForm({
      surface: "modal",
      title: "Add artifact",
      entity: new ProjectArtifact(),
      mode: "create",
    });
    if (action === "submit") {
      toast.success("Artifact uploaded");
      void tableRef.current?.reload();
    }
  };

  return (
    <>
      <h3>Artifacts — document library (SpeelDocumentForm)</h3>
      <div style={{ marginBottom: 8 }}>
        <ui.Button
          text="Add artifact"
          appearance="primary"
          onClick={() => void addArtifact()}
        />
      </div>
      <SpeelEntityTable
        ref={tableRef}
        of={ProjectArtifact}
        columns={(a) => [
          a.Title,
          {
            key: "file",
            header: "File",
            render: (r) =>
              r.FileLeafRef && r.FileRef ? (
                // A plain anchor: the adapter has no link primitive, and a link to a
                // file needs nothing a skin would add.
                <a href={r.FileRef} target="_blank" rel="noreferrer">
                  {r.FileLeafRef}
                </a>
              ) : (
                <span>—</span>
              ),
          },
          a.Project,
          a.Modified,
        ]}
        emptyMessage="No artifacts yet — add one."
        loadingMessage="Loading artifacts…"
      />
    </>
  );
};
